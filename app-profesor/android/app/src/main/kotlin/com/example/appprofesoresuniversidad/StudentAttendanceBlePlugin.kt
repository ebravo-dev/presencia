package com.example.appprofesoresuniversidad

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.Charset
import java.util.UUID

class StudentAttendanceBlePlugin(
    private val activity: FlutterActivity,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        private const val TAG = "StudentAttendanceBLE"
        private const val METHOD_CHANNEL = "com.presencia/student_attendance_ble"
        private const val EVENT_CHANNEL = "com.presencia/student_attendance_ble_events"
        private const val REQUESTED_MTU = 512
        private const val TEACHER_ACK_TIMEOUT_MS = 20_000L
        private const val MAX_CONCURRENT_GATT_CONNECTIONS = 6
        private val SERVICE_UUID: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1")
        private val ATTENDANCE_UUID_CHAR: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c2")
        private val CONFIRMATION_CHAR: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c3")
    }

    private val context: Context get() = activity.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private var eventSink: EventChannel.EventSink? = null
    private var targetUuids: Set<String> = emptySet()
    private var confirmationPayloads: Map<String, String> = emptyMap()
    private val handledUuids = mutableSetOf<String>()
    private val inFlightUuids = mutableSetOf<String>()
    private val activeGatts = mutableMapOf<String, BluetoothGatt>()
    private val mtuByAddress = mutableMapOf<String, Int>()
    private val pendingDetections = mutableMapOf<String, PendingDetection>()
    private val pendingAddressByUuid = mutableMapOf<String, String>()
    @Volatile
    private var isActivityInForeground = true

    private data class PendingDetection(
        val uuid: String,
        val bluetoothAddress: String,
        val rssi: Int,
        val normalizedUuid: String,
    )

    private val bluetoothAdapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            if (isActivityInForeground) {
                connectToCandidate(result)
            }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            if (isActivityInForeground) {
                results.forEach(::connectToCandidate)
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "Scan failed: $errorCode")
        }
    }

    fun register(messenger: BinaryMessenger) {
        MethodChannel(messenger, METHOD_CHANNEL).setMethodCallHandler(this)
        EventChannel(messenger, EVENT_CHANNEL).setStreamHandler(this)
    }

    /** Stops the student BLE scan and open GATT connections outside the visible app. */
    fun onActivityPaused() {
        isActivityInForeground = false
        stopScanning()
    }

    /** Scanning is only started again by an explicit action in the visible UI. */
    fun onActivityResumed() {
        isActivityInForeground = true
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        eventSink = events
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "startScanning" -> {
                val rawPayloads = call.argument<Map<*, *>>("confirmationPayloads")
                val payloads = rawPayloads
                    ?.entries
                    ?.mapNotNull { entry ->
                        val uuid = entry.key as? String ?: return@mapNotNull null
                        val payload = entry.value as? String ?: return@mapNotNull null
                        val normalized = normalizeUuid(uuid)
                        if (normalized.isEmpty() || payload.isBlank()) null else normalized to payload
                    }
                    ?.toMap()
                    .orEmpty()
                if (payloads.isEmpty()) {
                    result.error("INVALID_ARGUMENT", "Se requieren confirmaciones por matricula", null)
                    return
                }
                try {
                    startScanning(payloads)
                    result.success(true)
                } catch (error: Exception) {
                    Log.e(TAG, "Error starting student BLE scan", error)
                    result.error("SCAN_ERROR", error.message, null)
                }
            }
            "stopScanning" -> {
                stopScanning()
                result.success(true)
            }
            "confirmAttendance" -> {
                val normalized = normalizeUuid(call.argument<String>("uuid"))
                if (normalized.isEmpty()) {
                    result.error("INVALID_ARGUMENT", "Se requiere el UUID del alumno", null)
                    return
                }
                result.success(confirmAttendance(normalized))
            }
            else -> result.notImplemented()
        }
    }

    private fun startScanning(payloads: Map<String, String>) {
        if (!isActivityInForeground) {
            throw IllegalStateException("La detección BLE solo está disponible con la app en primer plano")
        }
        ensureRuntimePermissions()
        stopScanning()
        confirmationPayloads = payloads
        targetUuids = payloads.keys
        handledUuids.clear()
        inFlightUuids.clear()

        val scanner = bluetoothAdapter?.bluetoothLeScanner
            ?: throw IllegalStateException("Bluetooth no disponible")
        val filters = listOf(
            ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()
        )
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanner.startScan(filters, settings, scanCallback)
        Log.i(TAG, "Student BLE scan started for ${targetUuids.size} UUID(s)")
    }

    private fun stopScanning() {
        try {
            bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (error: Exception) {
            Log.w(TAG, "Error stopping scan: ${error.message}")
        }
        activeGatts.values.forEach { gatt ->
            try {
                gatt.disconnect()
                gatt.close()
            } catch (_: Exception) {
            }
        }
        activeGatts.clear()
        pendingDetections.clear()
        pendingAddressByUuid.clear()
        mtuByAddress.clear()
        inFlightUuids.clear()
    }

    private fun connectToCandidate(result: ScanResult) {
        if (!isActivityInForeground) return

        val device = result.device ?: return
        val address = device.address ?: return
        if (activeGatts.containsKey(address)) return
        // Android devices have a small BLE connection budget. Advertisements
        // continue arriving, so remaining students are picked up as slots free.
        if (activeGatts.size >= MAX_CONCURRENT_GATT_CONNECTIONS) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) return

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (!isActivityInForeground) {
                    closeGatt(address, gatt)
                    return
                }
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.i(TAG, "Connected to student candidate $address; requesting MTU")
                    mtuByAddress[address] = 23
                    if (!gatt.requestMtu(REQUESTED_MTU) && !gatt.discoverServices()) {
                        Log.w(TAG, "Could not start service discovery for $address")
                        closeGatt(address, gatt)
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    closeGatt(address, gatt)
                }
            }

            override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                mtuByAddress[address] = if (status == BluetoothGatt.GATT_SUCCESS) mtu else 23
                if (!gatt.discoverServices()) {
                    Log.w(TAG, "Could not start service discovery after MTU negotiation for $address")
                    closeGatt(address, gatt)
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (!isActivityInForeground) {
                    closeGatt(address, gatt)
                    return
                }
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    Log.w(TAG, "Service discovery failed for $address with status=$status")
                    closeGatt(address, gatt)
                    return
                }
                val characteristic = gatt
                    .getService(SERVICE_UUID)
                    ?.getCharacteristic(ATTENDANCE_UUID_CHAR)
                if (characteristic == null) {
                    Log.w(TAG, "Attendance characteristic not found for $address")
                    closeGatt(address, gatt)
                    return
                }
                if (!gatt.readCharacteristic(characteristic)) {
                    Log.w(TAG, "Could not start attendance UUID read for $address")
                    closeGatt(address, gatt)
                }
            }

            @Suppress("DEPRECATION")
            override fun onCharacteristicRead(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int,
            ) {
                val value = characteristic.value
                handleAttendanceUuid(gatt, address, result.rssi, value, status)
            }

            override fun onCharacteristicRead(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray,
                status: Int,
            ) {
                handleAttendanceUuid(gatt, address, result.rssi, value, status)
            }

            override fun onCharacteristicWrite(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int,
            ) {
                if (!isActivityInForeground) {
                    closeGatt(address, gatt)
                    return
                }
                if (characteristic.uuid == CONFIRMATION_CHAR &&
                    status == BluetoothGatt.GATT_SUCCESS) {
                    completeConfirmation(address)
                } else {
                    Log.w(
                        TAG,
                        "Attendance confirmation failed for $address with status=$status",
                    )
                }
                mainHandler.postDelayed({ closeGatt(address, gatt) }, 650)
            }
        }

        val gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, callback)
        }
        activeGatts[address] = gatt
    }

    @Suppress("DEPRECATION")
    private fun handleAttendanceUuid(
        gatt: BluetoothGatt,
        address: String,
        rssi: Int,
        value: ByteArray?,
        status: Int = BluetoothGatt.GATT_SUCCESS,
    ) {
        if (!isActivityInForeground) {
            closeGatt(address, gatt)
            return
        }
        if (status != BluetoothGatt.GATT_SUCCESS || value == null) {
            Log.w(TAG, "Attendance UUID read failed for $address status=$status valueIsNull=${value == null}")
            closeGatt(address, gatt)
            return
        }
        val uuid = value.toString(Charset.forName("UTF-8")).trim()
        val normalized = normalizeUuid(uuid)
        if (normalized.isEmpty() ||
            !targetUuids.contains(normalized) ||
            handledUuids.contains(normalized) ||
            !inFlightUuids.add(normalized)) {
            Log.i(TAG, "Ignoring non-target student UUID from $address: $uuid")
            closeGatt(address, gatt)
            return
        }

        Log.i(TAG, "Matched student UUID from $address: $uuid")

        val confirmation = gatt.getService(SERVICE_UUID)?.getCharacteristic(CONFIRMATION_CHAR)
        if (confirmation == null) {
            Log.w(TAG, "Confirmation characteristic not found for $address")
            inFlightUuids.remove(normalized)
            closeGatt(address, gatt)
            return
        }
        val confirmationPayload = confirmationPayloads[normalized]
        if (confirmationPayload == null) {
            Log.w(TAG, "No confirmation payload for matched UUID $normalized")
            inFlightUuids.remove(normalized)
            closeGatt(address, gatt)
            return
        }
        val confirmationBytes = confirmationPayload.toByteArray(Charsets.UTF_8)
        val maximumPayloadSize = (mtuByAddress[address] ?: 23) - 3
        if (confirmationBytes.size > maximumPayloadSize) {
            Log.w(
                TAG,
                "Student confirmation is too large for $address: ${confirmationBytes.size}/$maximumPayloadSize bytes",
            )
            inFlightUuids.remove(normalized)
            closeGatt(address, gatt)
            return
        }
        pendingDetections[address] = PendingDetection(
            uuid = uuid,
            bluetoothAddress = address,
            rssi = rssi,
            normalizedUuid = normalized,
        )
        pendingAddressByUuid[normalized] = address
        emitDetectionForTeacher(pendingDetections.getValue(address))
        mainHandler.postDelayed({
            if (pendingAddressByUuid[normalized] == address) {
                Log.w(TAG, "Teacher app did not acknowledge $normalized before timeout")
                closeGatt(address, gatt)
            }
        }, TEACHER_ACK_TIMEOUT_MS)
    }

    @Suppress("DEPRECATION")
    private fun confirmAttendance(normalizedUuid: String): Boolean {
        val address = pendingAddressByUuid[normalizedUuid] ?: return false
        val detection = pendingDetections[address]
        val gatt = activeGatts[address]
        if (detection == null || gatt == null || detection.normalizedUuid != normalizedUuid) {
            return false
        }

        val confirmation = gatt.getService(SERVICE_UUID)?.getCharacteristic(CONFIRMATION_CHAR)
            ?: run {
                closeGatt(address, gatt)
                return false
            }
        val payload = confirmationPayloads[normalizedUuid]
            ?: run {
                closeGatt(address, gatt)
                return false
            }
        val bytes = payload.toByteArray(Charsets.UTF_8)
        val maximumPayloadSize = (mtuByAddress[address] ?: 23) - 3
        if (bytes.size > maximumPayloadSize) {
            Log.w(TAG, "Student confirmation is too large for $address: ${bytes.size}/$maximumPayloadSize bytes")
            closeGatt(address, gatt)
            return false
        }

        confirmation.value = bytes
        if (!gatt.writeCharacteristic(confirmation)) {
            Log.w(TAG, "Could not write teacher-approved confirmation to $address")
            closeGatt(address, gatt)
            return false
        }
        return true
    }

    private fun emitDetectionForTeacher(detection: PendingDetection) {
        mainHandler.post {
            if (isActivityInForeground) {
                eventSink?.success(
                    listOf(
                        mapOf(
                            "uuid" to detection.uuid,
                            "bluetoothAddress" to detection.bluetoothAddress,
                            "rssi" to detection.rssi,
                        )
                    )
                )
            }
        }
    }

    private fun completeConfirmation(address: String) {
        val detection = pendingDetections.remove(address) ?: return
        if (pendingAddressByUuid[detection.normalizedUuid] == address) {
            pendingAddressByUuid.remove(detection.normalizedUuid)
        }
        inFlightUuids.remove(detection.normalizedUuid)
        handledUuids.add(detection.normalizedUuid)
        Log.i(TAG, "Teacher-approved confirmation delivered for ${detection.normalizedUuid}")
    }

    private fun closeGatt(address: String, gatt: BluetoothGatt) {
        // A late callback from an old connection must not clear a newer GATT
        // session that happens to use the same Bluetooth address.
        if (activeGatts[address] === gatt) {
            activeGatts.remove(address)
            pendingDetections.remove(address)?.let { pending ->
                if (pendingAddressByUuid[pending.normalizedUuid] == address) {
                    pendingAddressByUuid.remove(pending.normalizedUuid)
                }
                inFlightUuids.remove(pending.normalizedUuid)
            }
            mtuByAddress.remove(address)
        }
        try {
            gatt.disconnect()
            gatt.close()
        } catch (_: Exception) {
        }
    }

    private fun ensureRuntimePermissions() {
        val missing = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!hasPermission(Manifest.permission.BLUETOOTH_SCAN)) missing.add(Manifest.permission.BLUETOOTH_SCAN)
            if (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) missing.add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) missing.add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (missing.isNotEmpty()) {
            throw SecurityException("Permisos faltantes: ${missing.joinToString()}")
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    private fun normalizeUuid(uuid: String?): String {
        return uuid?.replace("-", "")?.lowercase()?.trim().orEmpty()
    }
}

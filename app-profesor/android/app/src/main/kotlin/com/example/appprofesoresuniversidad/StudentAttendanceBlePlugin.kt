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
        private val SERVICE_UUID: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1")
        private val ATTENDANCE_UUID_CHAR: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c2")
        private val CONFIRMATION_CHAR: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c3")
    }

    private val context: Context get() = activity.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private var eventSink: EventChannel.EventSink? = null
    private var targetUuids: Set<String> = emptySet()
    private val handledUuids = mutableSetOf<String>()
    private val activeGatts = mutableMapOf<String, BluetoothGatt>()

    private val bluetoothAdapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            connectToCandidate(result)
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            results.forEach(::connectToCandidate)
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "Scan failed: $errorCode")
        }
    }

    fun register(messenger: BinaryMessenger) {
        MethodChannel(messenger, METHOD_CHANNEL).setMethodCallHandler(this)
        EventChannel(messenger, EVENT_CHANNEL).setStreamHandler(this)
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
                val uuids = call.argument<List<String>>("uuids") ?: emptyList()
                if (uuids.isEmpty()) {
                    result.error("INVALID_ARGUMENT", "Se requiere al menos un UUID", null)
                    return
                }
                try {
                    startScanning(uuids)
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
            else -> result.notImplemented()
        }
    }

    private fun startScanning(uuids: List<String>) {
        ensureRuntimePermissions()
        stopScanning()
        targetUuids = uuids.map { normalizeUuid(it) }.filter { it.isNotEmpty() }.toSet()
        handledUuids.clear()

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
    }

    private fun connectToCandidate(result: ScanResult) {
        val device = result.device ?: return
        val address = device.address ?: return
        if (activeGatts.containsKey(address)) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) return

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    closeGatt(address, gatt)
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                val characteristic = gatt
                    .getService(SERVICE_UUID)
                    ?.getCharacteristic(ATTENDANCE_UUID_CHAR)
                if (characteristic == null) {
                    closeGatt(address, gatt)
                    return
                }
                gatt.readCharacteristic(characteristic)
            }

            @Suppress("DEPRECATION")
            override fun onCharacteristicRead(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int,
            ) {
                val value = characteristic.value
                handleAttendanceUuid(gatt, address, result.rssi, value)
            }

            override fun onCharacteristicRead(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray,
                status: Int,
            ) {
                handleAttendanceUuid(gatt, address, result.rssi, value)
            }

            override fun onCharacteristicWrite(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int,
            ) {
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
        value: ByteArray,
    ) {
        val uuid = value.toString(Charset.forName("UTF-8")).trim()
        val normalized = normalizeUuid(uuid)
        if (normalized.isEmpty() || !targetUuids.contains(normalized) || !handledUuids.add(normalized)) {
            closeGatt(address, gatt)
            return
        }

        mainHandler.post {
            eventSink?.success(
                listOf(
                    mapOf(
                        "uuid" to uuid,
                        "bluetoothAddress" to address,
                        "rssi" to rssi,
                    )
                )
            )
        }

        val confirmation = gatt.getService(SERVICE_UUID)?.getCharacteristic(CONFIRMATION_CHAR)
        if (confirmation == null) {
            closeGatt(address, gatt)
            return
        }
        confirmation.value = "CONFIRMED".toByteArray(Charsets.UTF_8)
        gatt.writeCharacteristic(confirmation)
    }

    private fun closeGatt(address: String, gatt: BluetoothGatt) {
        activeGatts.remove(address)
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

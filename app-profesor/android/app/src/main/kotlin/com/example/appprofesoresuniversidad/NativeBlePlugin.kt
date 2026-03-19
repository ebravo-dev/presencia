package com.example.appprofesoresuniversidad

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import io.flutter.plugin.common.*
import java.util.UUID

class NativeBlePlugin(private val context: Context) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        private const val TAG = "NativeBLE"
        private val GAP_SERVICE_UUID: UUID = UUID.fromString("00001800-0000-1000-8000-00805f9b34fb")
        private val DEVICE_NAME_CHAR_UUID: UUID = UUID.fromString("00002a00-0000-1000-8000-00805f9b34fb")
    }

    private var eventSink: EventChannel.EventSink? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        manager?.adapter
    }

    private val scanner: BluetoothLeScanner? get() = bluetoothAdapter?.bluetoothLeScanner

    // Dispositivos descubiertos (mantener referencia)
    private val discoveredDevices = mutableMapOf<String, BluetoothDevice>()

    // Callback para escaneo
    private var scanCallback: ScanCallback? = null

    // Para conectar y leer nombre GAP
    private var connectGatt: BluetoothGatt? = null
    private var connectCompletion: ((String) -> Unit)? = null

    fun register(messenger: BinaryMessenger) {
        val methodChannel = MethodChannel(messenger, "com.presencia/ble")
        val eventChannel = EventChannel(messenger, "com.presencia/ble_scan")
        methodChannel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(this)
    }

    // MARK: - EventChannel.StreamHandler

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        eventSink = events
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
    }

    // MARK: - MethodChannel Handler

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "checkBluetoothState" -> {
                result.success(getBluetoothState())
            }

            "startScan" -> {
                val serviceUuids = call.argument<List<String>>("serviceUuids")
                val status = startScan(serviceUuids)
                result.success(status)
            }

            "stopScan" -> {
                stopScan()
                result.success(null)
            }

            "connectAndReadName" -> {
                val deviceId = call.argument<String>("deviceId")
                val device = if (deviceId != null) discoveredDevices[deviceId] else null
                if (device == null) {
                    result.success("")
                    return
                }
                connectAndReadName(device) { name ->
                    mainHandler.post { result.success(name) }
                }
            }

            "disconnect" -> {
                connectGatt?.close()
                connectGatt = null
                result.success(null)
            }

            else -> result.notImplemented()
        }
    }

    // MARK: - Bluetooth State

    private fun getBluetoothState(): String {
        val adapter = bluetoothAdapter ?: return "unsupported"
        return if (adapter.isEnabled) "poweredOn" else "poweredOff"
    }

    // MARK: - Scan

    // UUIDs de iBeacon para filtrar por manufacturer data
    private var targetBeaconUuids: List<String>? = null

    private fun startScan(serviceUuids: List<String>?): String {
        val bleScanner = scanner
        if (bleScanner == null) {
            Log.w(TAG, "Cannot scan — scanner not available")
            return "error:scanner_not_available"
        }

        stopScan()

        // Si hay UUIDs, guardamos para filtrar por manufacturer data (iBeacon)
        targetBeaconUuids = serviceUuids

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, scanResult: ScanResult) {
                val device = scanResult.device
                val deviceId = device.address
                discoveredDevices[deviceId] = device

                val name = scanResult.scanRecord?.deviceName ?: device.name ?: ""
                val rssi = scanResult.rssi

                val services = mutableListOf<String>()
                scanResult.scanRecord?.serviceUuids?.forEach { uuid ->
                    services.add(uuid.uuid.toString())
                }

                // Si hay filtro de iBeacon, verificar manufacturer data
                val targets = targetBeaconUuids
                if (targets != null && targets.isNotEmpty()) {
                    val iBeaconUuid = parseIBeaconUuid(scanResult)
                    if (iBeaconUuid != null) {
                        Log.i(TAG, "iBeacon found: uuid=$iBeaconUuid device=$deviceId rssi=$rssi")
                        // Comparar contra UUIDs objetivo
                        val matched = targets.any { target ->
                            val normalizedTarget = target.replace("-", "").lowercase()
                            val normalizedFound = iBeaconUuid.replace("-", "").lowercase()
                            normalizedTarget == normalizedFound
                        }
                        if (matched) {
                            Log.i(TAG, "iBeacon MATCH! uuid=$iBeaconUuid")
                            val deviceData = mapOf(
                                "type" to "device",
                                "deviceId" to deviceId,
                                "name" to "iBeacon",
                                "rssi" to rssi,
                                "serviceUuids" to listOf(iBeaconUuid),
                            )
                            mainHandler.post { eventSink?.success(deviceData) }
                        }
                    }
                    // No emitir dispositivos que no son el beacon buscado
                    return
                }

                // Sin filtro → emitir todo
                val deviceData = mapOf(
                    "type" to "device",
                    "deviceId" to deviceId,
                    "name" to name,
                    "rssi" to rssi,
                    "serviceUuids" to services,
                )

                mainHandler.post { eventSink?.success(deviceData) }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.e(TAG, "Scan failed: $errorCode")
            }
        }

        // Siempre escanear sin filtro de service UUID (iBeacon usa manufacturer data)
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        if (serviceUuids != null && serviceUuids.isNotEmpty()) {
            Log.i(TAG, "Starting scan for iBeacon UUIDs: $serviceUuids (parsing manufacturer data)")
        } else {
            Log.i(TAG, "Starting scan without filter (all devices)")
        }

        bleScanner.startScan(null, settings, scanCallback)
        return if (serviceUuids != null && serviceUuids.isNotEmpty()) {
            "ibeacon_mfg_scan_started:${serviceUuids.first()}"
        } else {
            "ble_scan_started"
        }
    }

    /// Parsea el UUID de un iBeacon desde manufacturer data de Apple (company ID 0x004C)
    private fun parseIBeaconUuid(scanResult: ScanResult): String? {
        val record = scanResult.scanRecord ?: return null
        // Apple company ID = 0x004C
        val mfgData = record.getManufacturerSpecificData(0x004C) ?: return null

        // iBeacon format (after company ID):
        // Byte 0: type (0x02)
        // Byte 1: length (0x15 = 21)
        // Bytes 2-17: UUID (16 bytes)
        // Bytes 18-19: Major
        // Bytes 20-21: Minor
        // Byte 22: TX Power
        if (mfgData.size < 23 || mfgData[0] != 0x02.toByte() || mfgData[1] != 0x15.toByte()) {
            return null
        }

        val sb = StringBuilder()
        for (i in 2..17) {
            sb.append(String.format("%02x", mfgData[i]))
            if (i == 5 || i == 7 || i == 9 || i == 11) sb.append("-")
        }
        return sb.toString()
    }

    private fun stopScan() {
        scanCallback?.let { cb ->
            try {
                scanner?.stopScan(cb)
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping scan: ${e.message}")
            }
        }
        scanCallback = null
    }

    // Convierte UUID corto (4 chars) a formato largo 128-bit
    private fun formatUuid(uuid: String): String {
        return if (uuid.length == 4) {
            "0000${uuid.lowercase()}-0000-1000-8000-00805f9b34fb"
        } else {
            uuid
        }
    }

    // MARK: - Connect & Read GAP Name

    private fun connectAndReadName(device: BluetoothDevice, completion: (String) -> Unit) {
        connectCompletion = completion
        connectGatt?.close()

        val timeoutRunnable = Runnable {
            Log.w(TAG, "Connect timeout for ${device.address}")
            connectGatt?.close()
            connectGatt = null
            val cb = connectCompletion
            connectCompletion = null
            cb?.invoke("")
        }
        mainHandler.postDelayed(timeoutRunnable, 5000)

        connectGatt = device.connectGatt(context, false, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.i(TAG, "Connected to ${device.address}")
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    mainHandler.removeCallbacks(timeoutRunnable)
                    gatt.close()
                    val cb = connectCompletion
                    connectCompletion = null
                    cb?.invoke("")
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    mainHandler.removeCallbacks(timeoutRunnable)
                    gatt.disconnect()
                    return
                }

                val gapService = gatt.getService(GAP_SERVICE_UUID)
                val nameChar = gapService?.getCharacteristic(DEVICE_NAME_CHAR_UUID)
                if (nameChar != null) {
                    gatt.readCharacteristic(nameChar)
                } else {
                    mainHandler.removeCallbacks(timeoutRunnable)
                    gatt.disconnect()
                    val cb = connectCompletion
                    connectCompletion = null
                    cb?.invoke("")
                }
            }

            override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                mainHandler.removeCallbacks(timeoutRunnable)
                val name = if (status == BluetoothGatt.GATT_SUCCESS && characteristic.value != null) {
                    String(characteristic.value, Charsets.UTF_8)
                } else {
                    ""
                }
                if (name.isNotEmpty()) {
                    Log.i(TAG, "Resolved name: \"$name\" for ${device.address}")
                }
                gatt.disconnect()
                val cb = connectCompletion
                connectCompletion = null
                cb?.invoke(name)
            }
        })
    }
}

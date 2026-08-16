package com.presencia.app_alumno

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID

class BleAdvertiserService : Service() {

    companion object {
        private const val TAG = "StudentBeacon"
        const val PREFS_NAME = "ble_prefs"

        private const val NOTIFICATION_ID = 9001
        private const val CHANNEL_ID = "student_beacon_advertiser"

        const val ACTION_START = "com.presencia.START_ADVERTISE"
        const val ACTION_STOP = "com.presencia.STOP_ADVERTISE"

        const val EXTRA_UUID = "uuid"
        const val EXTRA_MAJOR = "major"
        const val EXTRA_MINOR = "minor"
        const val EXTRA_MEASURED_POWER = "measuredPower"

        private const val DEFAULT_MAJOR = 1
        private const val DEFAULT_MINOR = 1
        private const val DEFAULT_MEASURED_POWER = -59
        private val SERVICE_UUID: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1")
        private val ATTENDANCE_UUID_CHAR: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c2")
        private val CONFIRMATION_CHAR: UUID = UUID.fromString("9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c3")

        @Volatile
        var onAdvertisingStateChanged: ((Boolean) -> Unit)? = null

        @Volatile
        var onAttendanceConfirmed: ((String) -> Unit)? = null
    }

    private var gattServer: BluetoothGattServer? = null
    private var prefs: SharedPreferences? = null
    private var activeUuid: String? = null
    private var attendanceCharacteristic: BluetoothGattCharacteristic? = null
    private var waitingForGattService = false
    private val advertiser by lazy {
        (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager)
            .adapter
            .bluetoothLeAdvertiser
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.i(TAG, "Student attendance peripheral started")
            updateNotification("Asistencia activa")
            onAdvertisingStateChanged?.invoke(true)
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Student attendance peripheral failed: $errorCode")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
        }
    }

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.i(TAG, "Professor connected: ${device.address}")
            }
        }

        override fun onServiceAdded(status: Int, service: BluetoothGattService) {
            Log.i(TAG, "Attendance GATT service added status=$status service=${service.uuid}")
            if (service.uuid != SERVICE_UUID || !waitingForGattService) return
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.e(TAG, "Could not register attendance GATT service: $status")
                waitingForGattService = false
                onAdvertisingStateChanged?.invoke(false)
                stopSelf()
                return
            }
            waitingForGattService = false
            startBleAdvertising()
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic,
        ) {
            if (characteristic.uuid != ATTENDANCE_UUID_CHAR) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
                return
            }
            val bytes = activeUuid.orEmpty().toByteArray(Charsets.UTF_8)
            characteristic.value = bytes
            Log.i(TAG, "Professor read attendance UUID offset=$offset bytes=${bytes.size}")
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, bytes)
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray,
        ) {
            if (characteristic.uuid == CONFIRMATION_CHAR) {
                val message = value.toString(Charsets.UTF_8).trim()
                if (!isConfirmationForThisStudent(message)) {
                    Log.w(TAG, "Rejected GATT confirmation for a different matricula")
                    if (responseNeeded) {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_FAILURE,
                            offset,
                            null,
                        )
                    }
                    return
                }
                Log.i(TAG, "Attendance confirmed by professor: $message")
                onAttendanceConfirmed?.invoke(message)
                updateNotification("Asistencia recibida")
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
                }
                stopAdvertising()
                stopSelf()
                return
            }
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
            }
        }
    }

    private fun isConfirmationForThisStudent(message: String): Boolean {
        val expectedMatricula = prefs
            ?.getString("student_matricula", null)
            ?.trim()
            ?.uppercase()
            .orEmpty()
        if (expectedMatricula.isEmpty() || message.isEmpty()) return false

        return try {
            val payload = JSONObject(message)
            val matricula = payload.optString("id").trim().uppercase()
            val materia = payload.optString("materia").trim()
            val dia = payload.optString("dia").trim()
            val validShape = payload.length() == 2 ||
                (payload.length() == 3 && payload.has("dia") && isValidGattDay(dia))
            validShape &&
                matricula == expectedMatricula &&
                materia.isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    private fun isValidGattDay(value: String): Boolean {
        if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(value)) return false
        return try {
            val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
                isLenient = false
            }
            val parsed = formatter.parse(value) ?: return false
            formatter.format(parsed) == value
        } catch (_: Exception) {
            false
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForegroundWithNotification()
                val uuid = intent.getStringExtra(EXTRA_UUID)
                    ?: prefs?.getString("student_attendance_uuid", null)
                val major = intent.getIntExtra(EXTRA_MAJOR, DEFAULT_MAJOR)
                val minor = intent.getIntExtra(EXTRA_MINOR, DEFAULT_MINOR)
                val measuredPower = intent.getIntExtra(
                    EXTRA_MEASURED_POWER,
                    DEFAULT_MEASURED_POWER,
                )
                startAdvertising(uuid, major, minor, measuredPower)
            }
            ACTION_STOP -> {
                stopAdvertising()
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startAdvertising(
        uuid: String?,
        major: Int,
        minor: Int,
        measuredPower: Int,
    ) {
        if (uuid.isNullOrBlank()) {
            Log.e(TAG, "Missing student attendance UUID")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
            return
        }

        val bleAdvertiser = advertiser
        if (bleAdvertiser == null) {
            Log.e(TAG, "BLE advertising unsupported")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
            return
        }

        stopAdvertising()
        activeUuid = uuid

        val manager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val server = manager.openGattServer(this, gattCallback)
        if (server == null) {
            Log.e(TAG, "Could not open GATT server")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
            return
        }
        val uuidBytes = uuid.toByteArray(Charsets.UTF_8)
        attendanceCharacteristic = BluetoothGattCharacteristic(
            ATTENDANCE_UUID_CHAR,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ,
        ).apply {
            value = uuidBytes
        }
        gattServer = server

        waitingForGattService = true
        val serviceAdded = server.addService(
            BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY).apply {
                addCharacteristic(
                    attendanceCharacteristic
                )
                addCharacteristic(
                    BluetoothGattCharacteristic(
                        CONFIRMATION_CHAR,
                        BluetoothGattCharacteristic.PROPERTY_WRITE,
                        BluetoothGattCharacteristic.PERMISSION_WRITE,
                    )
                )
            }
        )
        if (!serviceAdded) {
            Log.e(TAG, "Could not enqueue attendance GATT service")
            waitingForGattService = false
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
        }
    }

    private fun startBleAdvertising() {
        val bleAdvertiser = advertiser
        if (bleAdvertiser == null) {
            Log.e(TAG, "BLE advertising unsupported")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .build()
        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .setIncludeDeviceName(false)
            .build()
        bleAdvertiser.startAdvertising(settings, data, advertiseCallback)
    }

    private fun stopAdvertising() {
        try {
            advertiser?.stopAdvertising(advertiseCallback)
        } catch (error: Exception) {
            Log.w(TAG, "Error stopping attendance advertising: ${error.message}")
        }
        gattServer?.close()
        gattServer = null
        activeUuid = null
        attendanceCharacteristic = null
        waitingForGattService = false
        onAdvertisingStateChanged?.invoke(false)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Asistencia automatica",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Registro automatico de asistencia"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundWithNotification() {
        val notification = buildNotification("Iniciando asistencia")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Presencia")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    override fun onDestroy() {
        stopAdvertising()
        super.onDestroy()
    }
}

package com.smsservice.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.smsservice.app.data.PrefsManager
import com.smsservice.app.service.SmsGatewayService
import org.json.JSONException
import org.json.JSONObject
import java.util.concurrent.Executors

private const val TAG = "PairingScreen"

@Composable
fun PairingScreen(
    prefsManager: PrefsManager,
    onPaired: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var showManualEntry by remember { mutableStateOf(false) }
    var qrScanError by remember { mutableStateOf<String?>(null) }

    // Manual entry state
    var serverUrl by remember { mutableStateOf("") }
    var registrationToken by remember { mutableStateOf("") }
    var deviceId by remember { mutableStateOf("") }
    var manualError by remember { mutableStateOf<String?>(null) }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (!granted) {
            showManualEntry = true
        }
    }

    fun handleQrResult(json: JSONObject) {
        try {
            val scannedServerUrl = json.getString("serverUrl")
            val scannedToken = json.getString("registrationToken")
            val scannedDeviceId = json.getString("deviceId")

            prefsManager.serverUrl = scannedServerUrl
            prefsManager.registrationToken = scannedToken
            prefsManager.deviceId = scannedDeviceId
            prefsManager.isPaired = true

            SmsGatewayService.startService(context)
            onPaired()
        } catch (e: JSONException) {
            qrScanError = "Invalid QR code format. Expected {serverUrl, registrationToken, deviceId}."
            Log.e(TAG, "QR JSON parse error", e)
        }
    }

    fun handleManualPair() {
        if (serverUrl.isBlank() || registrationToken.isBlank() || deviceId.isBlank()) {
            manualError = "All fields are required."
            return
        }
        val normalizedUrl = serverUrl.trimEnd('/')
        prefsManager.serverUrl = normalizedUrl
        prefsManager.registrationToken = registrationToken.trim()
        prefsManager.deviceId = deviceId.trim()
        prefsManager.isPaired = true

        SmsGatewayService.startService(context)
        onPaired()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "Pair Device",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = "Scan the QR code from your dashboard to connect",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (!showManualEntry) {
            // QR Scanner section
            if (hasCameraPermission) {
                QrScannerView(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp),
                    onQrDetected = { rawValue ->
                        try {
                            handleQrResult(JSONObject(rawValue))
                        } catch (e: JSONException) {
                            qrScanError = "Invalid QR code. Please use the dashboard QR code."
                        }
                    }
                )

                if (qrScanError != null) {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer
                        )
                    ) {
                        Text(
                            text = qrScanError!!,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            } else {
                // Request camera permission
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            "Camera permission is required to scan the QR code.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Button(
                            onClick = {
                                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                            }
                        ) {
                            Text("Grant Camera Permission")
                        }
                    }
                }
            }

            TextButton(
                onClick = { showManualEntry = true },
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                Text("Enter details manually instead")
            }
        } else {
            // Manual entry form
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "Manual Pairing",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    OutlinedTextField(
                        value = serverUrl,
                        onValueChange = { serverUrl = it; manualError = null },
                        label = { Text("Server URL") },
                        placeholder = { Text("http://192.168.1.100") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Next
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = deviceId,
                        onValueChange = { deviceId = it; manualError = null },
                        label = { Text("Device ID") },
                        placeholder = { Text("cuid from POST /api/devices") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Next
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = registrationToken,
                        onValueChange = { registrationToken = it; manualError = null },
                        label = { Text("Registration Token") },
                        placeholder = { Text("Token from POST /api/devices response") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (manualError != null) {
                        Text(
                            text = manualError!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }

                    Button(
                        onClick = { handleManualPair() },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Connect")
                    }
                }
            }

            if (hasCameraPermission) {
                TextButton(
                    onClick = { showManualEntry = false },
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                ) {
                    Text("Scan QR code instead")
                }
            }
        }
    }
}

@Composable
private fun QrScannerView(
    modifier: Modifier = Modifier,
    onQrDetected: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var detected by remember { mutableStateOf(false) }
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    val barcodeScanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build()
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            cameraExecutor.shutdown()
            barcodeScanner.close()
        }
    }

    Box(modifier = modifier) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }

                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()

                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }

                    val imageAnalysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()

                    imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                        processImageProxy(imageProxy, barcodeScanner, detected) { value ->
                            if (!detected) {
                                detected = true
                                onQrDetected(value)
                            }
                        }
                    }

                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            imageAnalysis
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to bind camera", e)
                    }
                }, ContextCompat.getMainExecutor(ctx))

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Scan guide overlay
        Box(
            modifier = Modifier
                .size(240.dp)
                .align(Alignment.Center)
                .background(
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                    RoundedCornerShape(12.dp)
                )
        )

        Text(
            text = "Point at the dashboard QR code",
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp)
                .background(
                    MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                    RoundedCornerShape(8.dp)
                )
                .padding(horizontal = 12.dp, vertical = 6.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@OptIn(ExperimentalGetImage::class)
private fun processImageProxy(
    imageProxy: ImageProxy,
    scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    alreadyDetected: Boolean,
    onDetected: (String) -> Unit
) {
    if (alreadyDetected) {
        imageProxy.close()
        return
    }
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(inputImage)
        .addOnSuccessListener { barcodes ->
            barcodes.firstOrNull()?.rawValue?.let { value ->
                onDetected(value)
            }
        }
        .addOnFailureListener { e ->
            Log.e(TAG, "Barcode scan failed", e)
        }
        .addOnCompleteListener {
            imageProxy.close()
        }
}

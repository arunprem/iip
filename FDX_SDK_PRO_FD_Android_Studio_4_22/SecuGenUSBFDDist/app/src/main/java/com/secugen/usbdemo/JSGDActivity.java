/*
 * Copyright (C) 2016 SecuGen Corporation
 *
 */

package com.secugen.usbdemo;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Message;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;

import com.secugen.usbdemo.R;
import SecuGen.FDxSDKPro.JSGFPLib;
import SecuGen.FDxSDKPro.SGANSITemplateInfo;
import SecuGen.FDxSDKPro.SGAutoOnEventNotifier;
import SecuGen.FDxSDKPro.SGFDxConstant;
import SecuGen.FDxSDKPro.SGFDxDeviceName;
import SecuGen.FDxSDKPro.SGFDxErrorCode;
import SecuGen.FDxSDKPro.SGFDxSecurityLevel;
import SecuGen.FDxSDKPro.SGFDxTemplateFormat;
import SecuGen.FDxSDKPro.SGFPImageInfo;
import SecuGen.FDxSDKPro.SGFingerInfo;
import SecuGen.FDxSDKPro.SGFingerPresentEvent;
import SecuGen.FDxSDKPro.SGISOTemplateInfo;
import SecuGen.FDxSDKPro.SGImpressionType;
import SecuGen.FDxSDKPro.SGWSQLib;

import android.Manifest;
import java.io.File;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import android.content.pm.PackageManager;
import android.os.Environment;
import java.io.FileOutputStream;
import android.widget.Toast;
import android.net.Uri;
import android.media.MediaScannerConnection;
import android.os.Build;

public class JSGDActivity extends Activity
        implements View.OnClickListener, Runnable, SGFingerPresentEvent {

    private static final String TAG = "SecuGen USB";
    private static final int IMAGE_CAPTURE_TIMEOUT_MS = 10000;
    private static final int IMAGE_CAPTURE_QUALITY = 50;

    private Button mButtonCapture;
	private Button mButtonCaptureAutoOn;
    private Button mButtonRegister;
	private Button mButtonRegisterAutoOn;
    private Button mButtonMatch;
	private Button mButtonMatchAutoOn;
    private Button mSDKTest;
    private EditText mEditLog;
    private TextView mTextViewResult;
    private android.widget.CheckBox mCheckBoxMatched;
//    private android.widget.ToggleButton mToggleButtonCaptureModeN;
    private PendingIntent mPermissionIntent;
    private ImageView mImageViewFingerprint;
    private ImageView mImageViewRegister;
    private ImageView mImageViewVerify;
    private byte[] mRegisterImage;
    private byte[] mVerifyImage;
    private byte[] mRegisterTemplate;
    private byte[] mVerifyTemplate;
	private int[] mMaxTemplateSize;
	private int mImageWidth;
	private int mImageHeight;
	private int mImageDPI;
	private int[] grayBuffer;
    private Bitmap grayBitmap;
    private IntentFilter filter; //2014-04-11
    private SGAutoOnEventNotifier autoOn;
    private boolean mAutoOnEnabled;
    private int nCaptureModeN;
    private Button mButtonReadSN;
    private boolean bSecuGenDeviceOpened;
    private JSGFPLib sgfplib;
    private boolean usbPermissionRequested;
//    private Switch mSwitchAutoOn;
	private Switch mSwitchNFIQ;
	private Switch mSwitchSmartCapture;
	private Switch mSwitchModeN;
	private Switch mSwitchLED;
	private SeekBar mSeekBarFDLevel;
	private TextView mTextViewFDLevel;
	private int[] mNumFakeThresholds;
	private int[] mDefaultFakeThreshold;
	private boolean[] mFakeEngineReady;
	private boolean bRegisterAutoOnMode;
	private boolean bVerifyAutoOnMode;
	private boolean bFingerprintRegistered;
	private int mFakeDetectionLevel = 1;


    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    private void debugMessage(String message) {
        this.mEditLog.append(message);
        this.mEditLog.invalidate(); //TODO trying to get Edit log to update after each line written
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    //This broadcast receiver is necessary to get user permissions to access the attached USB device
    private static final String ACTION_USB_PERMISSION = "com.android.example.USB_PERMISSION";
    private final BroadcastReceiver mUsbReceiver = new BroadcastReceiver() {
    	public void onReceive(Context context, Intent intent) {
    		String action = intent.getAction();
    		//Log.d(TAG,"Enter mUsbReceiver.onReceive()");
    		if (ACTION_USB_PERMISSION.equals(action)) {
    			synchronized (this) {
    				UsbDevice device = (UsbDevice)intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
    				if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
    					if(device != null){
    						//DEBUG Log.d(TAG, "Vendor ID : " + device.getVendorId() + "\n");
    						//DEBUG Log.d(TAG, "Product ID: " + device.getProductId() + "\n");
    						debugMessage("USB BroadcastReceiver VID : " + device.getVendorId() + "\n");
    						debugMessage("USB BroadcastReceiver PID: " + device.getProductId() + "\n");
    					}
    					else
        					;//Play Store Log.e(TAG, "mUsbReceiver.onReceive() Device is null");
    				}
    				else
    					;//Play StoreLog.e(TAG, "mUsbReceiver.onReceive() permission denied for device " + device);
    			}
    		}
    	}
    };

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    //This message handler is used to access local resources not
    //accessible by SGFingerPresentCallback() because it is called by
    //a separate thread.

    public Handler fingerDetectedHandler = new Handler(){
    	// @Override
	    public void handleMessage(Message msg) {
	       //Handle the message
			if (bRegisterAutoOnMode) {
				bRegisterAutoOnMode = false;
				RegisterFingerPrint();
			}
			else if (bVerifyAutoOnMode) {
				bVerifyAutoOnMode = false;
				VerifyFingerPrint();
			}
			else
				CaptureFingerPrint();
	    	if (mAutoOnEnabled) {
		    	EnableControls();
	    	}
	    }
    };

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
	public void EnableControls(){
		this.mButtonCaptureAutoOn.setClickable(true);
		this.mButtonCaptureAutoOn.setTextColor(getResources().getColor(android.R.color.black));
		this.mButtonCapture.setClickable(true);
		this.mButtonCapture.setTextColor(getResources().getColor(android.R.color.black));
		this.mButtonRegister.setClickable(true);
		this.mButtonRegister.setTextColor(getResources().getColor(android.R.color.black));
		this.mButtonRegisterAutoOn.setClickable(true);
		this.mButtonRegisterAutoOn.setTextColor(getResources().getColor(android.R.color.black));
		this.mButtonMatch.setClickable(true);
		this.mButtonMatch.setTextColor(getResources().getColor(android.R.color.black));
		this.mButtonMatchAutoOn.setClickable(true);
		this.mButtonMatchAutoOn.setTextColor(getResources().getColor(android.R.color.black));
	    mButtonReadSN.setClickable(true);
	}

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
	public void DisableControls(){
		this.mButtonCaptureAutoOn.setClickable(false);
		this.mButtonCaptureAutoOn.setTextColor(getResources().getColor(android.R.color.white));
		this.mButtonCapture.setClickable(false);
		this.mButtonCapture.setTextColor(getResources().getColor(android.R.color.white));
		this.mButtonRegister.setClickable(false);
		this.mButtonRegister.setTextColor(getResources().getColor(android.R.color.white));
		this.mButtonRegisterAutoOn.setClickable(false);
		this.mButtonRegisterAutoOn.setTextColor(getResources().getColor(android.R.color.white));
		this.mButtonMatch.setClickable(false);
		this.mButtonMatch.setTextColor(getResources().getColor(android.R.color.white));
		this.mButtonMatchAutoOn.setClickable(false);
		this.mButtonMatchAutoOn.setTextColor(getResources().getColor(android.R.color.white));
	    mButtonReadSN.setClickable(false);
	}


    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    @Override
    public void onCreate(Bundle savedInstanceState) {
    	//Play Store Log.d(TAG, "Enter onCreate()");
    	super.onCreate(savedInstanceState);
        setContentView(R.layout.launcher);
        mButtonCapture = (Button)findViewById(R.id.buttonCapture);
        mButtonCapture.setOnClickListener(this);
		mButtonCaptureAutoOn = (Button)findViewById(R.id.buttonCaptureAutoOn);
		mButtonCaptureAutoOn.setOnClickListener(this);
        mButtonRegister = (Button)findViewById(R.id.buttonRegister);
        mButtonRegister.setOnClickListener(this);
		mButtonRegisterAutoOn = (Button)findViewById(R.id.buttonRegisterAutoOn);
		mButtonRegisterAutoOn.setOnClickListener(this);
        mButtonMatch = (Button)findViewById(R.id.buttonMatch);
        mButtonMatch.setOnClickListener(this);
		mButtonMatchAutoOn = (Button)findViewById(R.id.buttonVerifyAutoOn);
		mButtonMatchAutoOn.setOnClickListener(this);
        mSDKTest = (Button)findViewById(R.id.buttonSDKTest);
        mSDKTest.setOnClickListener(this);
        mEditLog = (EditText)findViewById(R.id.editLog);
        mTextViewResult = (TextView)findViewById(R.id.textViewResult);
        mCheckBoxMatched = (android.widget.CheckBox) findViewById(R.id.checkBoxMatched);
//        mToggleButtonCaptureModeN = (android.widget.ToggleButton) findViewById(R.id.toggleButtonCaptureModeN);
//        mToggleButtonCaptureModeN.setOnClickListener(this);
        mImageViewFingerprint = (ImageView)findViewById(R.id.imageViewFingerprint);
        mImageViewRegister = (ImageView)findViewById(R.id.imageViewRegister);
        mImageViewVerify = (ImageView)findViewById(R.id.imageViewVerify);
		mButtonReadSN = (Button)findViewById(R.id.buttonReadSN);
		mButtonReadSN.setOnClickListener(this);
//		mSwitchAutoOn = (Switch) findViewById(R.id.switchAutoOn);
//		mSwitchAutoOn.setOnClickListener(this);
		mSwitchNFIQ = (Switch) findViewById(R.id.switchNFIQ);
		mSwitchNFIQ.setOnClickListener(this);
		mSwitchSmartCapture = (Switch) findViewById(R.id.switchSmartCapture);
		mSwitchSmartCapture.setOnClickListener(this);
		mSwitchModeN = (Switch) findViewById(R.id.switchModeN);
		mSwitchModeN.setOnClickListener(this);
		mSwitchLED = (Switch) findViewById(R.id.switchLED);
		mSwitchLED.setOnClickListener(this);
		mNumFakeThresholds = new int[1];
		mDefaultFakeThreshold = new int[1];
		mFakeEngineReady =new boolean[1];
		mTextViewFDLevel = (TextView) findViewById(R.id.textViewFDLevel);

		// perform seek bar change listener event used for getting the progress value
		mSeekBarFDLevel = (SeekBar) findViewById(R.id.seekBarFDLevel);
		mSeekBarFDLevel.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
			int progressChangedValue = 0;

			public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
				progressChangedValue = progress;
			}

			public void onStartTrackingTouch(SeekBar seekBar) {
				// TODO Auto-generated method stub
			}

			public void onStopTrackingTouch(SeekBar seekBar) {
				mFakeDetectionLevel = progressChangedValue;
				long error = JSGDActivity.this.sgfplib.SetFakeDetectionLevel(mFakeDetectionLevel);
				debugMessage("Ret[" + error + "] Set Fake Threshold: " + mFakeDetectionLevel + "\n");
				if (mFakeDetectionLevel > 1) {
					double[] thresholdValue = new double[1];
					error = sgfplib.FakeDetectionGetThresholdValue(thresholdValue);
					debugMessage("Ret[" + error + "] Fake Threshold Value: " + thresholdValue[0] + "\n");
				}
				JSGDActivity.this.mTextViewFDLevel.setText("Fake Threshold (" + mFakeDetectionLevel + "/" + mNumFakeThresholds[0] + ")");

			}
		});


		grayBuffer = new int[JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES* JSGFPLib.MAX_IMAGE_HEIGHT_ALL_DEVICES];
        for (int i=0; i<grayBuffer.length; ++i)
        	grayBuffer[i] = Color.GRAY;
        grayBitmap = Bitmap.createBitmap(JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES, JSGFPLib.MAX_IMAGE_HEIGHT_ALL_DEVICES, Bitmap.Config.ARGB_8888);
        grayBitmap.setPixels(grayBuffer, 0, JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES, 0, 0, JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES, JSGFPLib.MAX_IMAGE_HEIGHT_ALL_DEVICES);
        mImageViewFingerprint.setImageBitmap(grayBitmap);

        int[] sintbuffer = new int[(JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES/2)*(JSGFPLib.MAX_IMAGE_HEIGHT_ALL_DEVICES/2)];
        for (int i=0; i<sintbuffer.length; ++i)
        	sintbuffer[i] = Color.GRAY;
        Bitmap sb = Bitmap.createBitmap(JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES/2, JSGFPLib.MAX_IMAGE_HEIGHT_ALL_DEVICES/2, Bitmap.Config.ARGB_8888);
        sb.setPixels(sintbuffer, 0, JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES/2, 0, 0, JSGFPLib.MAX_IMAGE_WIDTH_ALL_DEVICES/2, JSGFPLib.MAX_IMAGE_HEIGHT_ALL_DEVICES/2);
        mImageViewRegister.setImageBitmap(grayBitmap);
        mImageViewVerify.setImageBitmap(grayBitmap);
        mMaxTemplateSize = new int[1];

        //USB Permissions
		//Changes for Android 14
		//API34
		if (Build.VERSION.SDK_INT >= 34)
        	mPermissionIntent = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_IMMUTABLE);
		else
			mPermissionIntent = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_MUTABLE);

       	filter = new IntentFilter(ACTION_USB_PERMISSION);
        sgfplib = new JSGFPLib(this, (UsbManager)getSystemService(Context.USB_SERVICE));
        this.mSwitchSmartCapture.setChecked(true);
//		DisableBrightnessControls();
//		this.mSwitchAutoOn.setChecked(false);
		this.mSwitchNFIQ.setChecked(false);
        bSecuGenDeviceOpened = false;
        usbPermissionRequested = false;

		debugMessage("Starting Activity\n");
		debugMessage("JSGFPLib version: " + sgfplib.GetJSGFPLibVersion() + "\n");
		mAutoOnEnabled = false;
		autoOn = new SGAutoOnEventNotifier(sgfplib, this);
		nCaptureModeN = 0;
    	//Play Store Log.d(TAG, "Exit onCreate()");
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    @Override
    public void onPause() {
    	//Play Store Log.d(TAG, "Enter onPause()");
		debugMessage("Enter onPause()\n");
    	if (bSecuGenDeviceOpened)
    	{
    		autoOn.stop();
    		EnableControls();
    		sgfplib.CloseDevice();
            bSecuGenDeviceOpened = false;
    	}
    	unregisterReceiver(mUsbReceiver);
    	mRegisterImage = null;
    	mVerifyImage = null;
    	mRegisterTemplate = null;
    	mVerifyTemplate = null;
        mImageViewFingerprint.setImageBitmap(grayBitmap);
        mImageViewRegister.setImageBitmap(grayBitmap);
        mImageViewVerify.setImageBitmap(grayBitmap);
        super.onPause();
    	//Play Store Log.d(TAG, "Exit onPause()");
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    @Override
    public void onResume(){
    	//Play Store Log.d(TAG, "Enter onResume()");
		debugMessage("Enter onResume()\n");
        super.onResume();
        DisableControls();
		//Changes for Android 14
		//API34
		if (Build.VERSION.SDK_INT >= 34)
       		registerReceiver(mUsbReceiver, filter, RECEIVER_EXPORTED);
		else
			registerReceiver(mUsbReceiver, filter);
        long error = sgfplib.Init( SGFDxDeviceName.SG_DEV_AUTO);
        if (error != SGFDxErrorCode.SGFDX_ERROR_NONE){
        	AlertDialog.Builder dlgAlert = new AlertDialog.Builder(this);
        	if (error == SGFDxErrorCode.SGFDX_ERROR_DEVICE_NOT_FOUND)
        		dlgAlert.setMessage("This application is used with SecuGen USB fingerprint sensors. No device was found. Please connect a fingerprint sensor and re-launch the application. To purchase a device, please contact sales@secugen.com");
        	else
        		dlgAlert.setMessage("This application is used with SecuGen USB fingerprint sensors. An error occurred on device initialization. Please connect a fingerprint sensor and re-launch the application. To purchase a device, please contact sales@secugen.com");
        	dlgAlert.setTitle("SecuGen Fingerprint Demo");
        	dlgAlert.setPositiveButton("OK",
        			new DialogInterface.OnClickListener() {
        		      public void onClick(DialogInterface dialog,int whichButton){
        		        	finish();
        		        	return;
        		      }
        			}
        	);
        	dlgAlert.setCancelable(false);
        	dlgAlert.create().show();

        }
        else {
	        UsbDevice usbDevice = sgfplib.GetUsbDevice();
	        if (usbDevice == null){
	        	AlertDialog.Builder dlgAlert = new AlertDialog.Builder(this);
	        	dlgAlert.setMessage("SecuGen fingerprint sensor not found!");
	        	dlgAlert.setTitle("SecuGen Fingerprint SDK");
	        	dlgAlert.setPositiveButton("OK",
	        			new DialogInterface.OnClickListener() {
	        		      public void onClick(DialogInterface dialog,int whichButton){
	        		        	finish();
	        		        	return;
	        		      }
	        			}
	        	);
	        	dlgAlert.setCancelable(false);
	        	dlgAlert.create().show();
	        }
	        else {
	        	boolean hasPermission = sgfplib.GetUsbManager().hasPermission(usbDevice);
		        if (!hasPermission) {
			        if (!usbPermissionRequested)
			        {
			    		debugMessage("Requesting USB Permission\n");
			        	//Log.d(TAG, "Call GetUsbManager().requestPermission()");
			        	usbPermissionRequested = true;
			        	sgfplib.GetUsbManager().requestPermission(usbDevice, mPermissionIntent);
			        }
			        else
			        {
			        	//wait up to 20 seconds for the system to grant USB permission
			        	hasPermission = sgfplib.GetUsbManager().hasPermission(usbDevice);
			    		debugMessage("Waiting for USB Permission\n");
			        	int i=0;
				        while ((hasPermission == false) && (i <= 40))
				        {
				        	++i;
				            hasPermission = sgfplib.GetUsbManager().hasPermission(usbDevice);
				        	try {
								Thread.sleep(500);
							} catch (InterruptedException e) {
								e.printStackTrace();
							}
				        	//Log.d(TAG, "Waited " + i*50 + " milliseconds for USB permission");
				        }
			        }
		        }
		        if (hasPermission) {
		    		debugMessage("Opening SecuGen Device\n");
			        error = sgfplib.OpenDevice(0);
					debugMessage("OpenDevice() ret: " + error + "\n");
					if (error == SGFDxErrorCode.SGFDX_ERROR_NONE)
					{
				        bSecuGenDeviceOpened = true;
						SecuGen.FDxSDKPro.SGDeviceInfoParam deviceInfo = new SecuGen.FDxSDKPro.SGDeviceInfoParam();
				        error = sgfplib.GetDeviceInfo(deviceInfo);
						debugMessage("GetDeviceInfo() ret: " + error + "\n");
				    	mImageWidth = deviceInfo.imageWidth;
				    	mImageHeight= deviceInfo.imageHeight;
				    	mImageDPI = deviceInfo.imageDPI;
						debugMessage("Image width: " + mImageWidth + "\n");
						debugMessage("Image height: " + mImageHeight + "\n");
						debugMessage("Image resolution: " + mImageDPI + "\n");
				    	debugMessage("Serial Number: " + new String(deviceInfo.deviceSN()) + "\n");

						error = sgfplib.FakeDetectionCheckEngineStatus(mFakeEngineReady);
						debugMessage("Ret[" + error + "] Fake Engine Ready: " + mFakeEngineReady[0] + "\n");
						if (mFakeEngineReady[0]) {
							error = sgfplib.FakeDetectionGetNumberOfThresholds(mNumFakeThresholds);
							debugMessage("Ret[" + error + "] Fake Thresholds: " + mNumFakeThresholds[0] + "\n");
							if (error != SGFDxErrorCode.SGFDX_ERROR_NONE)
								mNumFakeThresholds[0] = 1; //0=Off, 1=TouchChip
							this.mSeekBarFDLevel.setMax(mNumFakeThresholds[0]);

							error = sgfplib.FakeDetectionGetDefaultThreshold(mDefaultFakeThreshold);
							debugMessage("Ret[" + error + "] Default Fake Threshold: " + mDefaultFakeThreshold[0] + "\n");
							this.mTextViewFDLevel.setText("Fake Threshold (" + mDefaultFakeThreshold[0] + "/" + mNumFakeThresholds[0] + ")");
							mFakeDetectionLevel = mDefaultFakeThreshold[0];
							this.mSeekBarFDLevel.setProgress(mFakeDetectionLevel);
							//error = this.sgfplib.SetFakeDetectionLevel(mFakeDetectionLevel);
							//debugMessage("Ret[" + error + "] Set Fake Detection level: " + mFakeDetectionLevel + "\n");

							if (mFakeDetectionLevel > 1){
								double[] thresholdValue = new double[1];
								error = sgfplib.FakeDetectionGetThresholdValue(thresholdValue);
								debugMessage("Ret[" + error + "] Fake Threshold Value: " + thresholdValue[0] + "\n");
							}
						}
						else {
							mNumFakeThresholds[0] = 1;		//0=Off, 1=Touch Chip
							mDefaultFakeThreshold[0] = 1; 	//Touch Chip Enabled
							this.mTextViewFDLevel.setText("Fake Threshold (" + mDefaultFakeThreshold[0] + "/" + mNumFakeThresholds[0] + ")");
							//mFakeDetectionLevel = mDefaultFakeThreshold[0];
						}
						//this.mSeekBarFDLevel.setProgress(mFakeDetectionLevel);
				        sgfplib.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794);
						sgfplib.GetMaxTemplateSize(mMaxTemplateSize);
						debugMessage("TEMPLATE_FORMAT_ISO19794 SIZE: " + mMaxTemplateSize[0] + "\n");
				        mRegisterTemplate = new byte[(int)mMaxTemplateSize[0]];
				        mVerifyTemplate = new byte[(int)mMaxTemplateSize[0]];
				        EnableControls();
				        boolean smartCaptureEnabled = this.mSwitchSmartCapture.isChecked();
				        if (smartCaptureEnabled)
				        	sgfplib.WriteData(SGFDxConstant.WRITEDATA_COMMAND_ENABLE_SMART_CAPTURE, (byte)1);
				        else
				        	sgfplib.WriteData(SGFDxConstant.WRITEDATA_COMMAND_ENABLE_SMART_CAPTURE, (byte)0);
				        if (mAutoOnEnabled){
				        	autoOn.start();
				        	DisableControls();
				        }
			        }
			        else
			        {
						debugMessage("Waiting for USB Permission\n");
			        }
		        }
		        //Thread thread = new Thread(this);
		        //thread.start();
	        }
        }

        //TEST
        byte[] sha256Hash = new byte[32];
        sgfplib.getFirmwareSHA256Hash(sha256Hash);
        //END TEST
    	//Play Store Log.d(TAG, "Exit onResume()");
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    @Override
    public void onDestroy() {
    	//Play Store Log.d(TAG, "Enter onDestroy()");
		//Add check for open device
		//sgfplib.CloseDevice(); 			//2025-02-13
		if (bSecuGenDeviceOpened) 			//2025-02-13
		{ 									//2025-02-13
			autoOn.stop(); 					//2025-02-13
			EnableControls(); 				//2025-02-13
			sgfplib.CloseDevice(); 			//2025-02-13
			bSecuGenDeviceOpened = false; 	//2025-02-13
		} 									//2025-02-13

    	mRegisterImage = null;
    	mVerifyImage = null;
    	mRegisterTemplate = null;
    	mVerifyTemplate = null;
    	sgfplib.Close();
        super.onDestroy();
    	//Play Store Log.d(TAG, "Exit onDestroy()");
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    //Converts image to grayscale (NEW)
    public Bitmap toGrayscale(byte[] mImageBuffer, int width, int height)
    {
        byte[] Bits = new byte[mImageBuffer.length * 4];
        for (int i = 0; i < mImageBuffer.length; i++) {
                        Bits[i * 4] = Bits[i * 4 + 1] = Bits[i * 4 + 2] = mImageBuffer[i]; // Invert the source bits
                        Bits[i * 4 + 3] = -1;// 0xff, that's the alpha.
        }

        Bitmap bmpGrayscale = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        bmpGrayscale.copyPixelsFromBuffer(ByteBuffer.wrap(Bits));
        return bmpGrayscale;
    }


    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    //Converts image to grayscale (NEW)
    public Bitmap toGrayscale(byte[] mImageBuffer)
    {
        byte[] Bits = new byte[mImageBuffer.length * 4];
        for (int i = 0; i < mImageBuffer.length; i++) {
                        Bits[i * 4] = Bits[i * 4 + 1] = Bits[i * 4 + 2] = mImageBuffer[i]; // Invert the source bits
                        Bits[i * 4 + 3] = -1;// 0xff, that's the alpha.
        }

        Bitmap bmpGrayscale = Bitmap.createBitmap(mImageWidth, mImageHeight, Bitmap.Config.ARGB_8888);
        bmpGrayscale.copyPixelsFromBuffer(ByteBuffer.wrap(Bits));
        return bmpGrayscale;
    }


    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    //Converts image to grayscale (NEW)
    public Bitmap toGrayscale(Bitmap bmpOriginal)
    {
        int width, height;
        height = bmpOriginal.getHeight();
        width = bmpOriginal.getWidth();
        Bitmap bmpGrayscale = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        for (int y=0; y< height; ++y) {
            for (int x=0; x< width; ++x){
            	int color = bmpOriginal.getPixel(x, y);
            	int r = (color >> 16) & 0xFF;
            	int g = (color >> 8) & 0xFF;
            	int b = color & 0xFF;
            	int gray = (r+g+b)/3;
            	color = Color.rgb(gray, gray, gray);
            	//color = Color.rgb(r/3, g/3, b/3);
            	bmpGrayscale.setPixel(x, y, color);
            }
        }
        return bmpGrayscale;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    //Converts image to binary (OLD)
    public Bitmap toBinary(Bitmap bmpOriginal)
    {
        int width, height;
        height = bmpOriginal.getHeight();
        width = bmpOriginal.getWidth();
        Bitmap bmpGrayscale = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
        Canvas c = new Canvas(bmpGrayscale);
        Paint paint = new Paint();
        ColorMatrix cm = new ColorMatrix();
        cm.setSaturation(0);
        ColorMatrixColorFilter f = new ColorMatrixColorFilter(cm);
        paint.setColorFilter(f);
        c.drawBitmap(bmpOriginal, 0, 0, paint);
        return bmpGrayscale;
    }

	public void DumpFile(String fileName, byte[] buffer) {
/*
		Context context = this;
	
		try {
			// Get the app's private external storage directory
			File directory = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
			if (directory == null) {
				debugMessage("Error: External storage is not available.\n");
				return;
			}
	
			// Create the file in the app's private directory
			File file = new File(directory, fileName);
	
			// Write the data to the file
			try (FileOutputStream fos = new FileOutputStream(file)) {
				fos.write(buffer);
			}
	
			debugMessage("File saved successfully: " + file.getAbsolutePath() + "\n");
	
			// Optionally, you can make the file visible in the gallery
			MediaScannerConnection.scanFile(context,
					new String[]{file.getAbsolutePath()}, null,
					(path, uri) -> {
						debugMessage("File added to gallery: " + uri + "\n");
					});
	
		} catch (IOException e) {
			debugMessage("Error saving file: " + e.getMessage() + "\n");
			e.printStackTrace();
		}
		*/
	}

	public void DumpFile3(String fileName, byte[] buffer)
	{
		/**/
		Context context = this;

		// Define the directory to save the file
		File path = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);

		// Create a new file named "finger.bmp"
		File file = new File(path, fileName);

		// Ensure the directory exists
		if (!path.exists()) {
			path.mkdirs();
		}

		FileOutputStream fileOutputStream = null;

		try {
			// Create a FileOutputStream to write to the file
			fileOutputStream = new FileOutputStream(file);

			// Compress the bitmap as BMP and write to the file
			// Android doesn't have direct BMP format support, but you can save it in PNG or JPEG format instead
			fileOutputStream.write(buffer);
			fileOutputStream.close();

			//Log.d("FileHelper", "File saved successfully: " + file.getAbsolutePath());

		} catch (IOException e) {
			e.printStackTrace();
			//Log.e("FileHelper", "Error saving file", e);
		} finally {
			if (fileOutputStream != null) {
				try {
					fileOutputStream.close();
				} catch (IOException e) {
					e.printStackTrace();
				}
			}
		}
		 /**/
	}


	//////////////////////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////////////////////
	public void DumpFile2(String fileName, byte[] buffer)
	{
		//Uncomment section below to dump images and templates to SD card
    	/**/
		int REQUEST_WRITE_STORAGE = 112;
		//Context context = this.getParent().getBaseContext();
		Context context = this;
		// Check for write permissions
		boolean hasPermission = (ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED);
		if (!hasPermission) {
			ActivityCompat.requestPermissions((Activity) context, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQUEST_WRITE_STORAGE);
		}

		// Create the file
		File file = new File(Environment.getExternalStorageDirectory(), fileName);
		FileOutputStream fos = null;
		try {
			fos = new FileOutputStream(file);
			fos.write(buffer);
			fos.close();
			Toast.makeText(context, "File saved successfully", Toast.LENGTH_SHORT).show();

			// Notify the media scanner
			context.sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(file)));
		} catch (IOException e) {
			//Log.e("FileUtils", "Error writing file", e);
			Toast.makeText(context, "Error saving file", Toast.LENGTH_SHORT).show();
		} finally {
			if (fos != null) {
				try {
					fos.close();
				} catch (IOException e) {
					//Log.e("FileUtils", "Error closing file output stream", e);
				}
			}
		}
       /**/
	}

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    public void DumpFileOld(String fileName, byte[] buffer)
    {
    	//Uncomment section below to dump images and templates to SD card
    	/*
        try {
            File myFile = new File("/sdcard/Download/" + fileName);
            myFile.createNewFile();
            FileOutputStream fOut = new FileOutputStream(myFile);
            fOut.write(buffer,0,buffer.length);
            fOut.close();
        } catch (Exception e) {
            debugMessage("Exception when writing file" + fileName);
        }
       */
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    public void SGFingerPresentCallback (){
		autoOn.stop();
		fingerDetectedHandler.sendMessage(new Message());
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
	public void CaptureFingerPrint(){
		long dwTimeStart = 0, dwTimeEnd = 0, dwTimeElapsed = 0;
		this.mCheckBoxMatched.setChecked(false);
	    byte[] buffer = new byte[mImageWidth*mImageHeight];
	    dwTimeStart = System.currentTimeMillis();
	    long result = sgfplib.GetImage(buffer);

	    String NFIQString;
	    if (this.mSwitchNFIQ.isChecked()) {
	    	long nfiq = sgfplib.ComputeNFIQ(buffer, mImageWidth, mImageHeight);
	    	//long nfiq = sgfplib.ComputeNFIQEx(buffer, mImageWidth, mImageHeight,500);
	    	NFIQString =  new String("NFIQ="+ nfiq);
	    }
	    else
	    	NFIQString = "";
	    dwTimeEnd = System.currentTimeMillis();
	    dwTimeElapsed = dwTimeEnd-dwTimeStart;
	    debugMessage("getImage() ret:" + result + " [" + dwTimeElapsed + "ms]" + NFIQString +"\n");
		mTextViewResult.setText("getImage() ret: " + result + " [" + dwTimeElapsed + "ms] " + NFIQString +"\n");
		DumpFile("capture.raw", buffer);

		//If fake detection engine is available, get score
		if ((mFakeEngineReady[0]) && (this.mFakeDetectionLevel > 1)) {
			double[] fakeScore = new double[1];
			result = sgfplib.FakeDetectionGetScore(fakeScore);
			debugMessage("FakeDetectionGetScore() ret:" + result + "\n");
			double[] thresholdValue = new double[1];
			result = sgfplib.FakeDetectionGetThresholdValue(thresholdValue);
			debugMessage("FakeDetectionGetThresholdValue() ret:" + result + "\n");
			debugMessage("Fake Score[" + fakeScore[0] + "] Threshold[" + thresholdValue[0] + "]\n");
			if (fakeScore[0] >= thresholdValue[0])
				debugMessage("LIVE FINGER\n");
			else
				debugMessage("FAKE FINGER\n");
		}
	    mImageViewFingerprint.setImageBitmap(this.toGrayscale(buffer));

        buffer = null;
	}

	//////////////////////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////////////////////
	public void RegisterFingerPrint(){
		long dwTimeStart = 0, dwTimeEnd = 0, dwTimeElapsed = 0;
		if (mRegisterImage != null)
			mRegisterImage = null;
		mRegisterImage = new byte[mImageWidth*mImageHeight];
		bFingerprintRegistered = false;
		this.mCheckBoxMatched.setChecked(false);
		dwTimeStart = System.currentTimeMillis();
		long result = sgfplib.GetImageEx(mRegisterImage, IMAGE_CAPTURE_TIMEOUT_MS,IMAGE_CAPTURE_QUALITY);
		DumpFile("register.raw", mRegisterImage);
		dwTimeEnd = System.currentTimeMillis();
		dwTimeElapsed = dwTimeEnd-dwTimeStart;
		debugMessage("GetImageEx() ret:" + result + " [" + dwTimeElapsed + "ms]\n");
		mImageViewFingerprint.setImageBitmap(this.toGrayscale(mRegisterImage));
		dwTimeStart = System.currentTimeMillis();
		result = sgfplib.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794);
		dwTimeEnd = System.currentTimeMillis();
		dwTimeElapsed = dwTimeEnd-dwTimeStart;
		debugMessage("SetTemplateFormat(ISO19794) ret:" +  result + " [" + dwTimeElapsed + "ms]\n");

		int quality1[] = new int[1];
		result = sgfplib.GetImageQuality(mImageWidth, mImageHeight, mRegisterImage, quality1);
		debugMessage("GetImageQuality() ret:" +  result + "quality [" + quality1[0] + "]\n");

		SGFingerInfo fpInfo = new SGFingerInfo();
		fpInfo.FingerNumber = 1;
		fpInfo.ImageQuality = quality1[0];
		fpInfo.ImpressionType = SGImpressionType.SG_IMPTYPE_LP;
		fpInfo.ViewNumber = 1;

		for (int i=0; i< mRegisterTemplate.length; ++i)
			mRegisterTemplate[i] = 0;
		dwTimeStart = System.currentTimeMillis();
		result = sgfplib.CreateTemplate(fpInfo, mRegisterImage, mRegisterTemplate);
		DumpFile("register.min", mRegisterTemplate);
		dwTimeEnd = System.currentTimeMillis();
		dwTimeElapsed = dwTimeEnd-dwTimeStart;
		debugMessage("CreateTemplate() ret:" + result + " [" + dwTimeElapsed + "ms]\n");
		mImageViewRegister.setImageBitmap(this.toGrayscale(mRegisterImage));
		if (result == SGFDxErrorCode.SGFDX_ERROR_NONE) {
			bFingerprintRegistered = true;

			int[] size = new int[1];
			result = sgfplib.GetTemplateSize(mRegisterTemplate, size);
			debugMessage("GetTemplateSize() ret:" + result + " size [" + size[0] + "]\n");

			mTextViewResult.setText("Fingerprint registered");
		}
		else{
			mTextViewResult.setText("Fingerprint not registered");
		}

		mRegisterImage = null;
		fpInfo = null;
	}

	//////////////////////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////////////////////
	public void VerifyFingerPrint() {
		long dwTimeStart = 0, dwTimeEnd = 0, dwTimeElapsed = 0;
		this.mCheckBoxMatched.setChecked(false);
		if (!bFingerprintRegistered) {
			mTextViewResult.setText("Please Register a finger");
			sgfplib.SetLedOn(false);
			return;
		}
		if (mVerifyImage != null)
			mVerifyImage = null;
		mVerifyImage = new byte[mImageWidth*mImageHeight];
		dwTimeStart = System.currentTimeMillis();
		long result = sgfplib.GetImageEx(mVerifyImage, IMAGE_CAPTURE_TIMEOUT_MS,IMAGE_CAPTURE_QUALITY);
		DumpFile("verify.raw", mVerifyImage);
		dwTimeEnd = System.currentTimeMillis();
		dwTimeElapsed = dwTimeEnd-dwTimeStart;
		debugMessage("GetImageEx() ret:" + result + " [" + dwTimeElapsed + "ms]\n");
		mImageViewFingerprint.setImageBitmap(this.toGrayscale(mVerifyImage));
		mImageViewVerify.setImageBitmap(this.toGrayscale(mVerifyImage));
		dwTimeStart = System.currentTimeMillis();
		result = sgfplib.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794);
		dwTimeEnd = System.currentTimeMillis();
		dwTimeElapsed = dwTimeEnd-dwTimeStart;
		debugMessage("SetTemplateFormat(ISO19794) ret:" +  result + " [" + dwTimeElapsed + "ms]\n");

		int quality[] = new int[1];
		result = sgfplib.GetImageQuality(mImageWidth, mImageHeight, mVerifyImage, quality);
		debugMessage("GetImageQuality() ret:" +  result + "quality [" + quality[0] + "]\n");

		SGFingerInfo fpInfo = new SGFingerInfo();
		fpInfo.FingerNumber = 1;
		fpInfo.ImageQuality = quality[0];
		fpInfo.ImpressionType = SGImpressionType.SG_IMPTYPE_LP;
		fpInfo.ViewNumber = 1;


		for (int i=0; i< mVerifyTemplate.length; ++i)
			mVerifyTemplate[i] = 0;
		dwTimeStart = System.currentTimeMillis();
		result = sgfplib.CreateTemplate(fpInfo, mVerifyImage, mVerifyTemplate);
		DumpFile("verify.min", mVerifyTemplate);
		dwTimeEnd = System.currentTimeMillis();
		dwTimeElapsed = dwTimeEnd-dwTimeStart;
		debugMessage("CreateTemplate() ret:" + result+ " [" + dwTimeElapsed + "ms]\n");
		if (result == SGFDxErrorCode.SGFDX_ERROR_NONE) {

			int[] size = new int[1];
			result = sgfplib.GetTemplateSize(mVerifyTemplate, size);
			debugMessage("GetTemplateSize() ret:" + result + " size [" + size[0] + "]\n");

			boolean[] matched = new boolean[1];
			dwTimeStart = System.currentTimeMillis();
			result = sgfplib.MatchTemplate(mRegisterTemplate, mVerifyTemplate, SGFDxSecurityLevel.SL_NORMAL, matched);
			dwTimeEnd = System.currentTimeMillis();
			dwTimeElapsed = dwTimeEnd - dwTimeStart;
			debugMessage("MatchTemplate() ret:" + result + " [" + dwTimeElapsed + "ms]\n");
			if (matched[0]) {
				mTextViewResult.setText("Fingerprint matched!\n");
				this.mCheckBoxMatched.setChecked(true);
				debugMessage("MATCHED!!\n");
			} else {
				mTextViewResult.setText("Fingerprint not matched!");
				debugMessage("NOT MATCHED!!\n");
			}
			matched = null;
		}
		else
			mTextViewResult.setText("Fingerprint template extraction failed.");
		mVerifyImage = null;
		fpInfo = null;
	}


    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    public void onClick(View v) {
		long dwTimeStart = 0, dwTimeEnd = 0, dwTimeElapsed = 0;

		if (v== mSwitchSmartCapture)
		{
			if(mSwitchSmartCapture.isChecked()){
	        	sgfplib.WriteData(SGFDxConstant.WRITEDATA_COMMAND_ENABLE_SMART_CAPTURE, (byte)1); //Enable Smart Capture
			}
	        else {
	        	sgfplib.WriteData(SGFDxConstant.WRITEDATA_COMMAND_ENABLE_SMART_CAPTURE, (byte)0); //Disable Smart Capture
	        }
		}
		if (v== mSwitchLED)
		{
			if(mSwitchLED.isChecked())
				sgfplib.SetLedOn(true);
			else
				sgfplib.SetLedOn(false);
		}
		if (v== mSwitchModeN)
		{
			if(mSwitchModeN.isChecked())
	        	sgfplib.WriteData((byte)0, (byte)0); //Enable Mode N, set Fake Detection Level 0
	        else
	        	sgfplib.WriteData((byte)0, (byte)2); //Disable Mode N, set default Fake Detection Level
		}
		if (v == this.mButtonReadSN){
			//Read Serial number
			byte[] szSerialNumber = new byte[15];
	        long result = sgfplib.ReadSerialNumber(szSerialNumber);
	        debugMessage("ReadSerialNumber() ret: " + result + " ["	+ new String(szSerialNumber) + "]\n");
			//Increment last byte and Write serial number
	        //szSerialNumber[14] += 1;
	        //error = sgfplib.WriteSerialNumber(szSerialNumber);
	        szSerialNumber = null;
		}
        if (v == mButtonCapture) {
        	CaptureFingerPrint();
        }
		if (v == mButtonCaptureAutoOn) {
			mAutoOnEnabled = true;
			mTextViewResult.setText("Auto On Enabled");
			autoOn.start(); //Enable Auto On
			DisableControls();
		}
		if (v == this.mSwitchNFIQ) {
			if(mSwitchNFIQ.isChecked()) {
				mTextViewResult.setText("NFIQ Enabled");
			}
			else {
				mTextViewResult.setText("NFIQ Disabled");
			}
		}
        if (v == mSDKTest) {
        	SDKTest();
        }
        if (v == this.mButtonRegister) {
            debugMessage("Clicked REGISTER\n");
			RegisterFingerPrint();
        }
		if (v == this.mButtonRegisterAutoOn) {
			debugMessage("Clicked REGISTER WITH AUTO ON\n");
			bRegisterAutoOnMode = true;
			mAutoOnEnabled = true;
			mTextViewResult.setText("Auto On enabled for registration");
			autoOn.start(); //Enable Auto On
			DisableControls();
		}
        if (v == this.mButtonMatch) {
        	//DEBUG Log.d(TAG, "Clicked VERIFY");
            debugMessage("Clicked VERIFY\n");
			VerifyFingerPrint();
        }
		if (v == this.mButtonMatchAutoOn) {
			//DEBUG Log.d(TAG, "Clicked VERIFY");
			debugMessage("Clicked VERIFY WITH AUTO ON\n");
			bVerifyAutoOnMode = true;
			mAutoOnEnabled = true;
			mTextViewResult.setText("Auto On enabled for verification");
			autoOn.start(); //Enable Auto On
			DisableControls();
		}
    }


    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    private void SDKTest(){
    	mTextViewResult.setText("");
    	debugMessage("\n###############\n");
    	debugMessage("### SDK Test  ###\n");
    	debugMessage("###############\n");

    	int X_SIZE = 248;
    	int Y_SIZE = 292;

        long error = 0;
        byte[] sgTemplate1;
        byte[] sgTemplate2;
        byte[] sgTemplate3;
        byte[] ansiTemplateBuffer;
        byte[] ansiTemplate1;
        byte[] ansiTemplate2;
        byte[] isoTemplateBuffer;
        byte[] isoTemplate1;
        byte[] isoTemplate2;
        byte[] ansiTemplate1Windows;
        byte[] ansiTemplate2Windows;
        byte[] ansiTemplate3Windows;
        byte[] isoCompactTemplate1;
        byte[] isoCompactTemplate2;
		byte[] isoCompactTemplateNoHeader1;

        int[] size = new int[1];
        int[] score = new int[1];
        int[] quality1 = new int[1];
        int[] quality2 = new int[1];
        int[] quality3 = new int[1];
        int[] numOfMinutiae = new int[1];
        long nfiq1;
        long nfiq2;
        long nfiq3;
        boolean[] matched = new boolean[1];

        byte[] finger1 = new byte[X_SIZE*Y_SIZE];
        byte[] finger2 = new byte[X_SIZE*Y_SIZE];
        byte[] finger3 = new byte[X_SIZE*Y_SIZE];
		long dwTimeStart = 0, dwTimeEnd = 0, dwTimeElapsed = 0;

        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.finger_0_10_3);
        	error = fileInputStream.read(finger1);
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.finger_0_10_3.\n");
        	return;
        }
        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.finger_1_10_3);
        	error = fileInputStream.read(finger2);
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.finger_1_10_3.\n");
        	return;
        }
        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.finger_2_10_3);
        	error = fileInputStream.read(finger3);
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.finger_2_10_3.\n");
        	return;
        }

        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.ansi378_0_10_3_windows);
            int length = fileInputStream.available();
            debugMessage("ansi378_0_10_3_windows.ansi378 \n\ttemplate length is: " + length + "\n");
            ansiTemplate1Windows = new byte[length];
        	error = fileInputStream.read(ansiTemplate1Windows);
            debugMessage("\tRead: " + error + "bytes\n");
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.ansi378_0_10_3_windows.ansi378.\n");
        	return;
        }
        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.ansi378_1_10_3_windows);
            int length = fileInputStream.available();
            debugMessage("ansi378_1_10_3_windows.ansi378 \n\ttemplate length is: " + length + "\n");
            ansiTemplate2Windows = new byte[length];
        	error = fileInputStream.read(ansiTemplate2Windows);
            debugMessage("\tRead: " + error + "bytes\n");
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.ansi378_1_10_3_windows.ansi378.\n");
        	return;
        }
        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.ansi378_2_10_3_windows);
            int length = fileInputStream.available();
            debugMessage("ansi378_2_10_3_windows.ansi378 \n\ttemplate length is: " + length + "\n");
            ansiTemplate3Windows = new byte[length];
        	error = fileInputStream.read(ansiTemplate3Windows);
            debugMessage("\tRead: " + error + "bytes\n");
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.ansi378_2_10_3_windows.ansi378.\n");
        	return;
        }

        JSGFPLib sgFplibSDKTest = new JSGFPLib(this, (UsbManager)getSystemService(Context.USB_SERVICE));

        error = sgFplibSDKTest.InitEx( X_SIZE, Y_SIZE, 500);
        debugMessage("InitEx("+ X_SIZE + "," + Y_SIZE + ",500) ret:" +  error + "\n");
        if (error != SGFDxErrorCode.SGFDX_ERROR_NONE)
        	return;

        SGFingerInfo fpInfo1 = new SGFingerInfo();
        SGFingerInfo fpInfo2 = new SGFingerInfo();
        SGFingerInfo fpInfo3 = new SGFingerInfo();

        error = sgFplibSDKTest.GetImageQuality((long)X_SIZE, (long)Y_SIZE, finger1, quality1);
        debugMessage("GetImageQuality(R.raw.finger_0_10_3) ret:" +  error + "\n\tFinger quality=" +  quality1[0] + "\n");
        error = sgFplibSDKTest.GetImageQuality((long)X_SIZE, (long)Y_SIZE, finger2, quality2);
        debugMessage("GetImageQuality(R.raw.finger_1_10_3) ret:" +  error + "\n\tFinger quality=" +  quality2[0] + "\n");
        error = sgFplibSDKTest.GetImageQuality((long)X_SIZE, (long)Y_SIZE, finger3, quality3);
        debugMessage("GetImageQuality(R.raw.finger_2_10_3) ret:" +  error + "\n\tFinger quality=" +  quality3[0] + "\n");

        dwTimeStart = System.currentTimeMillis();
        nfiq1 = sgFplibSDKTest.ComputeNFIQ(finger1, X_SIZE, Y_SIZE);
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;
        debugMessage("ComputeNFIQ(R.raw.finger_0_10_3)\n\tNFIQ=" +  nfiq1 + "\n");
        if (nfiq1 == 2)
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");

        dwTimeStart = System.currentTimeMillis();
        nfiq2 = sgFplibSDKTest.ComputeNFIQ(finger2, X_SIZE, Y_SIZE);
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;
        debugMessage("ComputeNFIQ(R.raw.finger_1_10_3)\n\tNFIQ=" +  nfiq2 + "\n");
        if (nfiq2 == 3)
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");

        dwTimeStart = System.currentTimeMillis();
        nfiq3 = sgFplibSDKTest.ComputeNFIQ(finger3, X_SIZE, Y_SIZE);
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;
        debugMessage("ComputeNFIQ(R.raw.finger_2_10_3)\n\tNFIQ=" +  nfiq3 + "\n");
        if (nfiq3 == 2)
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");

        fpInfo1.FingerNumber = 1;
        fpInfo1.ImageQuality = quality1[0];
        fpInfo1.ImpressionType = SGImpressionType.SG_IMPTYPE_LP;
        fpInfo1.ViewNumber = 1;

        fpInfo2.FingerNumber = 1;
        fpInfo2.ImageQuality = quality2[0];
        fpInfo2.ImpressionType = SGImpressionType.SG_IMPTYPE_LP;
        fpInfo2.ViewNumber = 2;

        fpInfo3.FingerNumber = 1;
        fpInfo3.ImageQuality = quality3[0];
        fpInfo3.ImpressionType = SGImpressionType.SG_IMPTYPE_LP;
        fpInfo3.ViewNumber = 3;



        ///////////////////////////////////////////////////////////////////////////////////////////////
        //TEST SG400
        debugMessage("#######################\n");
        debugMessage("TEST SG400\n");
        debugMessage("###\n###\n");
        error = sgFplibSDKTest.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400);
        debugMessage("SetTemplateFormat(SG400) ret:" +  error + "\n");
        error = sgFplibSDKTest.GetMaxTemplateSize(size);
        debugMessage("GetMaxTemplateSize() ret:" +  error + " SG400_MAX_SIZE=" +  size[0] + "\n");

        sgTemplate1  = new byte[(int)size[0]];
        sgTemplate2 = new byte[(int)size[0]];
        sgTemplate3 = new byte[(int)size[0]];

        //////////////////////////////////////////////////////////////////////////////////////////////
        //TEST DeviceInfo
        ///////////////////////////////////////////////////////////////////////////////////////////////
        error = sgFplibSDKTest.CreateTemplate(null, finger1, sgTemplate1);
        debugMessage("CreateTemplate(finger3) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(sgTemplate1, size);
        debugMessage("GetTemplateSize() ret:" +  error + " size=" +  size[0] + "\n");
        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400, sgTemplate1, numOfMinutiae);
        debugMessage("GetNumOfMinutiae() ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        error = sgFplibSDKTest.CreateTemplate(null, finger2, sgTemplate2);
        debugMessage("CreateTemplate(finger2) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(sgTemplate2, size);
        debugMessage("GetTemplateSize() ret:" +  error + " size=" +  size[0] + "\n");
        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400, sgTemplate2, numOfMinutiae);
        debugMessage("GetNumOfMinutiae() ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        error = sgFplibSDKTest.CreateTemplate(null, finger3, sgTemplate3);
        debugMessage("CreateTemplate(finger3) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(sgTemplate3, size);
        debugMessage("GetTemplateSize() ret:" +  error + " size=" +  size[0] + "\n");
        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400, sgTemplate3, numOfMinutiae);
        debugMessage("GetNumOfMinutiae() ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        ///////////////////////////////////////////////////////////////////////////////////////////////
        error = sgFplibSDKTest.MatchTemplate(sgTemplate1, sgTemplate2, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchTemplate(sgTemplate1,sgTemplate2) \n\tret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.GetMatchingScore(sgTemplate1, sgTemplate2,  score);
        debugMessage("GetMatchingScore(sgTemplate1, sgTemplate2) \n\tret:" + error + ". \n\tScore:" + score[0] + "\n");


        ///////////////////////////////////////////////////////////////////////////////////////////////
        error = sgFplibSDKTest.MatchTemplate(sgTemplate1, sgTemplate3, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchTemplate(sgTemplate1,sgTemplate3) \n\tret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.GetMatchingScore(sgTemplate1, sgTemplate3,  score);
        debugMessage("GetMatchingScore(sgTemplate1, sgTemplate3) \n\tret:" + error + ". \n\tScore:" + score[0] + "\n");


        ///////////////////////////////////////////////////////////////////////////////////////////////
        error = sgFplibSDKTest.MatchTemplate(sgTemplate2, sgTemplate3, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchTemplate(sgTemplate2,sgTemplate3) \n\tret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.GetMatchingScore(sgTemplate2, sgTemplate3,  score);
        debugMessage("GetMatchingScore(sgTemplate2, sgTemplate3) \n\tret:" + error + ". \n\tScore:" + score[0] + "\n");


        ///////////////////////////////////////////////////////////////////////////////////////////////
        //TEST ANSI378
        ///////////////////////////////////////////////////////////////////////////////////////////////
        debugMessage("#######################\n");
        debugMessage("TEST ANSI378\n");
        debugMessage("###\n###\n");
        error = sgFplibSDKTest.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378);
        debugMessage("SetTemplateFormat(ANSI378) ret:" +  error + "\n");
        error = sgFplibSDKTest.GetMaxTemplateSize(size);
        debugMessage("GetMaxTemplateSize() ret:" +  error + "\n\tANSI378_MAX_SIZE=" +  size[0] + "\n");

        ansiTemplateBuffer = new byte[(int)size[0]];

        error = sgFplibSDKTest.CreateTemplate(fpInfo1, finger1, ansiTemplateBuffer);
        debugMessage("CreateTemplate(finger1) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(ansiTemplateBuffer, size);
        debugMessage("GetTemplateSize(ansi) ret:" +  error + " size=" +  size[0] + "\n");
        ansiTemplate1  = new byte[(int)size[0]];
        for (int i=0; i<size[0]; ++i)
        	ansiTemplate1[i] = ansiTemplateBuffer[i];

        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378, ansiTemplate1, numOfMinutiae);
        debugMessage("GetNumOfMinutiae(ansi) ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        error = sgFplibSDKTest.CreateTemplate(fpInfo2, finger2, ansiTemplateBuffer);
        debugMessage("CreateTemplate(finger2) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(ansiTemplateBuffer, size);
        debugMessage("GetTemplateSize(ansi) ret:" +  error + " size=" +  size[0] + "\n");
        ansiTemplate2 = new byte[(int)size[0]];
        for (int i=0; i<size[0]; ++i)
        	ansiTemplate2[i] = ansiTemplateBuffer[i];


        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378, ansiTemplate2, numOfMinutiae);
        debugMessage("GetNumOfMinutiae(ansi) ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        error = sgFplibSDKTest.MatchTemplate(ansiTemplate1, ansiTemplate2, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchTemplate(ansi) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.GetMatchingScore(ansiTemplate1, ansiTemplate2,  score);
        debugMessage("GetMatchingScore(ansi) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        error = sgFplibSDKTest.GetTemplateSizeAfterMerge(ansiTemplate1, ansiTemplate2, size);
        debugMessage("GetTemplateSizeAfterMerge(ansi) ret:" + error + ". \n\tSize:" + size[0] + "\n");

        byte[] mergedAnsiTemplate1 = new byte[(int)size[0]];
        error = sgFplibSDKTest.MergeAnsiTemplate(ansiTemplate1, ansiTemplate2, mergedAnsiTemplate1);
        debugMessage("MergeAnsiTemplate() ret:" + error + "\n");

        error = sgFplibSDKTest.MatchAnsiTemplate(ansiTemplate1, 0, mergedAnsiTemplate1, 0, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchAnsiTemplate(0,0) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.MatchAnsiTemplate(ansiTemplate1, 0, mergedAnsiTemplate1, 1, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchAnsiTemplate(0,1) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.GetAnsiMatchingScore(ansiTemplate1, 0, mergedAnsiTemplate1, 0, score);
        debugMessage("GetAnsiMatchingScore(0,0) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        error = sgFplibSDKTest.GetAnsiMatchingScore(ansiTemplate1, 0, mergedAnsiTemplate1, 1, score);
        debugMessage("GetAnsiMatchingScore(0,1) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        SGANSITemplateInfo ansiTemplateInfo = new SGANSITemplateInfo();
        error = sgFplibSDKTest.GetAnsiTemplateInfo(ansiTemplate1, ansiTemplateInfo);
        debugMessage("GetAnsiTemplateInfo(ansiTemplate1) ret:" + error + "\n");
        debugMessage("   TotalSamples=" + ansiTemplateInfo.TotalSamples + "\n");
        for (int i=0; i<ansiTemplateInfo.TotalSamples; ++i){
	        debugMessage("   Sample[" + i + "].FingerNumber=" + ansiTemplateInfo.SampleInfo[i].FingerNumber + "\n");
	        debugMessage("   Sample[" + i + "].ImageQuality=" + ansiTemplateInfo.SampleInfo[i].ImageQuality + "\n");
	        debugMessage("   Sample[" + i + "].ImpressionType=" + ansiTemplateInfo.SampleInfo[i].ImpressionType + "\n");
	        debugMessage("   Sample[" + i + "].ViewNumber=" + ansiTemplateInfo.SampleInfo[i].ViewNumber + "\n");
        }

        error = sgFplibSDKTest.GetAnsiTemplateInfo(mergedAnsiTemplate1, ansiTemplateInfo);
        debugMessage("GetAnsiTemplateInfo(mergedAnsiTemplate1) ret:" + error + "\n");
        debugMessage("   TotalSamples=" + ansiTemplateInfo.TotalSamples + "\n");

        for (int i=0; i<ansiTemplateInfo.TotalSamples; ++i){
	        debugMessage("   Sample[" + i + "].FingerNumber=" + ansiTemplateInfo.SampleInfo[i].FingerNumber + "\n");
	        debugMessage("   Sample[" + i + "].ImageQuality=" + ansiTemplateInfo.SampleInfo[i].ImageQuality + "\n");
	        debugMessage("   Sample[" + i + "].ImpressionType=" + ansiTemplateInfo.SampleInfo[i].ImpressionType + "\n");
	        debugMessage("   Sample[" + i + "].ViewNumber=" + ansiTemplateInfo.SampleInfo[i].ViewNumber + "\n");
        }


        ///////////////////////////////////////////////////////////////////////////////////////////////
        //ALGORITHM COMPATIBILITY TEST
        ///////////////////////////////////////////////////////////////////////////////////////////////
        boolean compatible;
        debugMessage("#######################\n");
        debugMessage("TEST ANSI378 Compatibility\n");
        debugMessage("###\n###\n");
        ///
        error = sgFplibSDKTest.GetMatchingScore(ansiTemplate1, ansiTemplate1Windows,  score);

        debugMessage("0_10_3.raw <> 0_10_3.ansiw:" + score[0] + "\n");
        if (score[0] == 199)
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");

        ///
        error = sgFplibSDKTest.GetMatchingScore(ansiTemplate1, ansiTemplate2Windows,  score);
        debugMessage("0_10_3.raw <> 1_10_3.ansiw:" + score[0] + "\n");
        if (score[0] == 199)
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
        ///
        error = sgFplibSDKTest.GetMatchingScore(ansiTemplate1, ansiTemplate3Windows,  score);
        debugMessage("0_10_3.raw <> 2_10_3.ansiw:" + score[0] + "\n");
        if (score[0] == 176)
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
        ///
        error = sgFplibSDKTest.GetMatchingScore(ansiTemplate2, ansiTemplate3Windows,  score);
        if (score[0] == 192)
        	compatible = true;
        else
        	compatible = false;
        debugMessage("1_10_3.raw <> 2_10_3.ansiw:" + score[0] + "\n\tCompatible:" + compatible + "\n");

        ///////////////////////////////////////////////////////////////////////////////////////////////
        //TEST ISO19794-2
        ///////////////////////////////////////////////////////////////////////////////////////////////
        debugMessage("#######################\n");
        debugMessage("TEST ISO19794-2\n");
        debugMessage("###\n###\n");
        error = sgFplibSDKTest.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794);
        debugMessage("SetTemplateFormat(ISO19794) ret:" +  error + "\n");
        error = sgFplibSDKTest.GetMaxTemplateSize(size);
        debugMessage("GetMaxTemplateSize() ret:" +  error + " ISO19794_MAX_SIZE=" +  size[0] + "\n");


        isoTemplateBuffer = new byte[(int)size[0]];

        error = sgFplibSDKTest.CreateTemplate(fpInfo1, finger1, isoTemplateBuffer);
        debugMessage("CreateTemplate(finger1) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(isoTemplateBuffer, size);
        debugMessage("GetTemplateSize(iso) ret:" +  error + " \n\tsize=" +  size[0] + "\n");
        isoTemplate1  = new byte[(int)size[0]];
        for (int i=0; i<size[0]; ++i)
        	isoTemplate1[i] = isoTemplateBuffer[i];

        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794, isoTemplate1, numOfMinutiae);
        debugMessage("GetNumOfMinutiae(iso) ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        error = sgFplibSDKTest.CreateTemplate(fpInfo2, finger2, isoTemplateBuffer);
        debugMessage("CreateTemplate(finger2) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(isoTemplateBuffer, size);
        debugMessage("GetTemplateSize(iso) ret:" +  error + " \n\tsize=" +  size[0] + "\n");
        isoTemplate2  = new byte[(int)size[0]];
        for (int i=0; i<size[0]; ++i)
        	isoTemplate2[i] = isoTemplateBuffer[i];

        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794, isoTemplate2, numOfMinutiae);
        debugMessage("GetNumOfMinutiae(iso) ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        error = sgFplibSDKTest.MatchTemplate(isoTemplate1, isoTemplate2, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchTemplate(iso) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.GetMatchingScore(isoTemplate1, isoTemplate2,  score);
        debugMessage("GetMatchingScore(iso) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        error = sgFplibSDKTest.GetIsoTemplateSizeAfterMerge(isoTemplate1, isoTemplate2, size);
        debugMessage("GetIsoTemplateSizeAfterMerge() ret:" + error + ". \n\tSize:" + size[0] + "\n");


        byte[] mergedIsoTemplate1 = new byte[(int)size[0]];
        error = sgFplibSDKTest.MergeIsoTemplate(isoTemplate1, isoTemplate2, mergedIsoTemplate1);
        debugMessage("MergeIsoTemplate() ret:" + error + "\n");

        error = sgFplibSDKTest.MatchIsoTemplate(isoTemplate1, 0, mergedIsoTemplate1, 0, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchIsoTemplate(0,0) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.MatchIsoTemplate(isoTemplate1, 0, mergedIsoTemplate1, 1, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchIsoTemplate(0,1) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.GetIsoMatchingScore(isoTemplate1, 0, mergedIsoTemplate1, 0, score);
        debugMessage("GetIsoMatchingScore(0,0) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        error = sgFplibSDKTest.GetIsoMatchingScore(isoTemplate1, 0, mergedIsoTemplate1, 1, score);
        debugMessage("GetIsoMatchingScore(0,1) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        SGISOTemplateInfo isoTemplateInfo = new SGISOTemplateInfo();
        error = sgFplibSDKTest.GetIsoTemplateInfo(isoTemplate1, isoTemplateInfo);
        debugMessage("GetIsoTemplateInfo(isoTemplate1) \n\tret:" + error + "\n");
        debugMessage("\tTotalSamples=" + isoTemplateInfo.TotalSamples + "\n");
        for (int i=0; i<isoTemplateInfo.TotalSamples; ++i){
	        debugMessage("\tSample[" + i + "].FingerNumber=" + isoTemplateInfo.SampleInfo[i].FingerNumber + "\n");
	        debugMessage("\tSample[" + i + "].ImageQuality=" + isoTemplateInfo.SampleInfo[i].ImageQuality + "\n");
	        debugMessage("\tSample[" + i + "].ImpressionType=" + isoTemplateInfo.SampleInfo[i].ImpressionType + "\n");
	        debugMessage("\tSample[" + i + "].ViewNumber=" + isoTemplateInfo.SampleInfo[i].ViewNumber + "\n");
        }

        error = sgFplibSDKTest.GetIsoTemplateInfo(mergedIsoTemplate1, isoTemplateInfo);
        debugMessage("GetIsoTemplateInfo(mergedIsoTemplate1) \n\tret:" + error + "\n");
        debugMessage("\tTotalSamples=" + isoTemplateInfo.TotalSamples + "\n");
        for (int i=0; i<isoTemplateInfo.TotalSamples; ++i){
	        debugMessage("\tSample[" + i + "].FingerNumber=" + isoTemplateInfo.SampleInfo[i].FingerNumber + "\n");
	        debugMessage("\tSample[" + i + "].ImageQuality=" + isoTemplateInfo.SampleInfo[i].ImageQuality + "\n");
	        debugMessage("\tSample[" + i + "].ImpressionType=" + isoTemplateInfo.SampleInfo[i].ImpressionType + "\n");
	        debugMessage("\tSample[" + i + "].ViewNumber=" + isoTemplateInfo.SampleInfo[i].ViewNumber + "\n");
        }

        ///////////////////////////////////////////////////////////////////////////////////////////////
        //TEST ISO19794-2 Compact Template
        ///////////////////////////////////////////////////////////////////////////////////////////////
        debugMessage("#######################\n");
        debugMessage("TEST ISO19794-2 Compact\n");
        debugMessage("###\n###\n");
        error = sgFplibSDKTest.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT);
        debugMessage("SetTemplateFormat(ISO19794COMP) ret:" +  error + "\n");
        error = sgFplibSDKTest.GetMaxTemplateSize(size);
        debugMessage("GetMaxTemplateSize() ret:" +  error + " ISO19794_COMP_MAX_SIZE=" +  size[0] + "\n");

        isoCompactTemplate1  = new byte[(int)size[0]];
        isoCompactTemplate2 = new byte[(int) size[0]];

        error = sgFplibSDKTest.CreateTemplate(fpInfo1, finger1, isoCompactTemplate1);
        debugMessage("CreateTemplate(finger1) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(isoCompactTemplate1, size);
        debugMessage("GetTemplateSize(isocompact) ret:" +  error + " \n\tsize=" +  size[0] + "\n");
        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT, isoCompactTemplate1, numOfMinutiae);
        debugMessage("GetNumOfMinutiae(isocompact) ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");

        error = sgFplibSDKTest.CreateTemplate(fpInfo2, finger2, isoCompactTemplate2);
        debugMessage("CreateTemplate(finger2) ret:" + error + "\n");
        error = sgFplibSDKTest.GetTemplateSize(isoCompactTemplate2, size);
        debugMessage("GetTemplateSize(isocompact) ret:" +  error + " \n\tsize=" +  size[0] + "\n");
        error = sgFplibSDKTest.GetNumOfMinutiae(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT, isoCompactTemplate2, numOfMinutiae);
        debugMessage("GetNumOfMinutiae(isocompact) ret:" +  error + " minutiae=" +  numOfMinutiae[0] + "\n");        

        error = sgFplibSDKTest.MatchTemplate(isoCompactTemplate1, isoCompactTemplate2, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchTemplate(isocompact) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");
        
        error = sgFplibSDKTest.GetMatchingScore(isoCompactTemplate1, isoCompactTemplate2,  score);
        debugMessage("GetMatchingScore(isocompact) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        error = sgFplibSDKTest.GetIsoCompactTemplateSizeAfterMerge(isoCompactTemplate1, isoCompactTemplate2, size);
        debugMessage("GetIsoTemplateSizeAfterMerge() ret:" + error + ". \n\tSize:" + size[0] + "\n");

        byte[] mergedIsoCompactTemplate = new byte[(int)size[0]];
        error = sgFplibSDKTest.MergeIsoCompactTemplate(isoCompactTemplate1, isoCompactTemplate2, mergedIsoCompactTemplate);
        debugMessage("MergeIsoTemplate() ret:" + error + "\n");
        
        error = sgFplibSDKTest.MatchIsoCompactTemplate(isoCompactTemplate1, 0, mergedIsoCompactTemplate, 0, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchIsoCompactTemplate(0,0) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        error = sgFplibSDKTest.MatchIsoCompactTemplate(isoCompactTemplate1, 0, mergedIsoCompactTemplate, 1, SGFDxSecurityLevel.SL_NORMAL, matched);
        debugMessage("MatchIsoCompactTemplate(0,1) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");
        
        error = sgFplibSDKTest.GetIsoCompactMatchingScore(isoCompactTemplate1, 0, mergedIsoCompactTemplate, 0, score);
        debugMessage("GetIsoCompactMatchingScore(0,0) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        error = sgFplibSDKTest.GetIsoCompactMatchingScore(isoCompactTemplate1, 0, mergedIsoCompactTemplate, 1, score);
        debugMessage("GetIsoCompactMatchingScore(0,1) ret:" + error + ". \n\tScore:" + score[0] + "\n");                
        
        SGISOTemplateInfo isoCompactTemplateInfo = new SGISOTemplateInfo();
        error = sgFplibSDKTest.GetIsoCompactTemplateInfo(isoCompactTemplate1, isoCompactTemplateInfo);
        debugMessage("GetIsoCompactTemplateInfo(isoCompactTemplate1) \n\tret:" + error + "\n");
        debugMessage("\tTotalSamples=" + isoCompactTemplateInfo.TotalSamples + "\n");
        for (int i=0; i<isoCompactTemplateInfo.TotalSamples; ++i){
	        debugMessage("\tSample[" + i + "].FingerNumber=" + isoCompactTemplateInfo.SampleInfo[i].FingerNumber + "\n");
	        debugMessage("\tSample[" + i + "].ImageQuality=" + isoCompactTemplateInfo.SampleInfo[i].ImageQuality + "\n");
	        debugMessage("\tSample[" + i + "].ImpressionType=" + isoCompactTemplateInfo.SampleInfo[i].ImpressionType + "\n");
	        debugMessage("\tSample[" + i + "].ViewNumber=" + isoCompactTemplateInfo.SampleInfo[i].ViewNumber + "\n");
        }

        error = sgFplibSDKTest.GetIsoCompactTemplateInfo(mergedIsoCompactTemplate, isoCompactTemplateInfo);
        debugMessage("GetIsoCompactTemplateInfo(mergedIsoTemplate1) \n\tret:" + error + "\n");
        debugMessage("\tTotalSamples=" + isoCompactTemplateInfo.TotalSamples + "\n");
        for (int i=0; i<isoCompactTemplateInfo.TotalSamples; ++i){
	        debugMessage("\tSample[" + i + "].FingerNumber=" + isoCompactTemplateInfo.SampleInfo[i].FingerNumber + "\n");
	        debugMessage("\tSample[" + i + "].ImageQuality=" + isoCompactTemplateInfo.SampleInfo[i].ImageQuality + "\n");
	        debugMessage("\tSample[" + i + "].ImpressionType=" + isoCompactTemplateInfo.SampleInfo[i].ImpressionType + "\n");
	        debugMessage("\tSample[" + i + "].ViewNumber=" + isoCompactTemplateInfo.SampleInfo[i].ViewNumber + "\n"); 
        }

		///////////////////////////////////////////////////////////////////////////////////////////////
		//TEST ISO19794-2 Compact Template No Header
		///////////////////////////////////////////////////////////////////////////////////////////////
		debugMessage("#######################\n");
		debugMessage("TEST ISO19794-2 Compact No Header\n");
		debugMessage("###\n###\n");

		error = sgFplibSDKTest.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT_NO_HEADER);
		debugMessage("SetTemplateFormat(ISO19794COMPNOHDR) ret:" +  error + "\n");
		error = sgFplibSDKTest.GetMaxTemplateSize(size);
		debugMessage("GetMaxTemplateSize() ret:" +  error + " ISO19794_COMP_MAX_SIZE=" +  size[0] + "\n");

		byte[] test1Image;
        byte[] test1ISOCompactTemplateNoHeader = new byte[size[0]];;
		try {
			InputStream fileInputStream =getResources().openRawResource(R.raw.test1_image_256x400);
			int length = fileInputStream.available();
			debugMessage("R.raw.test1_image_256x400 \n\tsize is: " + length + "\n");
			test1Image = new byte[length];
			error = fileInputStream.read(test1Image);
			debugMessage("\tRead: " + error + "bytes\n");
			fileInputStream.close();
		} catch (IOException ex){
			debugMessage("Error: Unable to find fingerprint image R.raw.test1_image_256x400.\n");
			return;
		}
		try {
			InputStream fileInputStream =getResources().openRawResource(R.raw.test1_m_isocompactnoheader);
			int length = fileInputStream.available();
			isoTemplateBuffer = new byte[length];
			debugMessage("R.raw.test1_m_isocompactnoheader \n\tlength is: " + length + "\n");
			error = fileInputStream.read(test1ISOCompactTemplateNoHeader);
			debugMessage("\tRead: " + error + "bytes\n");
			fileInputStream.close();
		} catch (IOException ex){
			debugMessage("Error: Unable to find fingerprint template R.raw.test1_m_isocompactnoheader.\n");
			return;
		}


		byte[] isoCompactTemplateNoHeaderBuffer = new byte[(int) size[0]];

		int[] templateSize = new int[1];
		int maxMinutiae = 20;
		SGFPImageInfo finger = new SGFPImageInfo();
		finger.ImageSizeInX = 256;;      // in pixels
		finger.ImageSizeInY = 400;      // in pixels
		finger.XResolution = 197;       // in pixels per cm 500dpi = 197
		finger.YResolution = 197;       // in pixels per cm
		finger.FingerNumber= 1;			// FingerNumber.
		finger.ViewNumber = 1;           // Sample number
		finger.ImpressionType= 0;       // impression type. Should be 0
		finger.ImageQuality = 0;         // Image quality

		error = sgFplibSDKTest.CreateIsoCompactTemplateNoHeader(finger, test1Image, isoCompactTemplateNoHeaderBuffer,maxMinutiae, templateSize);
		debugMessage("CreateIsoCompactTemplateNoHeader(test1Image) ret:" + error + "\n");
		debugMessage("TemplateSize = " + templateSize[0] + "\n");
		isoCompactTemplateNoHeader1 = new byte[(int) templateSize[0]];
		for (int i=0; i< templateSize[0]; ++i)
			isoCompactTemplateNoHeader1[i] = isoCompactTemplateNoHeaderBuffer[i];

		error = sgFplibSDKTest.MatchIsoCompactTemplateNoHeader(test1ISOCompactTemplateNoHeader, isoCompactTemplateNoHeader1, SGFDxSecurityLevel.SL_NORMAL, matched);
		debugMessage("MatchIsoCompactTemplateNoHeader() ret:" + error + "\n");
		if (matched[0])
			debugMessage("\tMATCHED!!\n");
		else
			debugMessage("\tNOT MATCHED!!\n");

		error = sgFplibSDKTest.GetIsoCompactNoHeaderMatchingScore(test1ISOCompactTemplateNoHeader, isoCompactTemplateNoHeader1,  score);
		debugMessage("GetMatchingScore(isocompact) ret:" + error + ". \n\tScore:" + score[0] + "\n");


        ///////////////////////////////////////////////////////////////////////////////////////////////        
        //TEST Mixed Templates
        ///////////////////////////////////////////////////////////////////////////////////////////////        
        debugMessage("#######################\n");        
        debugMessage("TEST Mixed Templates\n");
        debugMessage("###\n###\n");        

        //////////////////////////////////////////
        //SG400<>SG400
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        		sgTemplate1, 
				SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
				(long)0,
				sgTemplate2, 
				SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
				(long)0,
				SGFDxSecurityLevel.SL_NORMAL,
				matched);
        debugMessage("MatchTemplateEx(SG400,SG400) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        		sgTemplate1, 
				SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
				(long)0,
				sgTemplate2, 
				SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
				(long)0,
				score);
        debugMessage("GetMatchingScoreEx(SG400,SG400) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        //////////////////////////////////////////
        //ISO19794<>ISO19794 
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									isoTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									isoTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									SGFDxSecurityLevel.SL_NORMAL,
        									matched);
        debugMessage("MatchTemplateEx(ISO1,ISO1) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx( 
        									isoTemplate2, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									isoTemplate2, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									SGFDxSecurityLevel.SL_NORMAL,
        									matched);
        debugMessage("MatchTemplateEx(ISO2,ISO2) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									isoTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									isoTemplate2, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									SGFDxSecurityLevel.SL_NORMAL,
        									matched);
        debugMessage("MatchTemplateEx(ISO1,ISO2) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");
        
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									isoTemplate2, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									isoTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
        									(long)0,
        									SGFDxSecurityLevel.SL_NORMAL,
        									matched);
        debugMessage("MatchTemplateEx(ISO2,ISO1) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");
        
        
        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									isoTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											isoTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ISO1,ISO1) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									isoTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											isoTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ISO2,ISO2) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									isoTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											isoTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ISO1,ISO2) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									isoTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											isoTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ISO2,ISO1) ret:" + error + ". \n\tScore:" + score[0] + "\n");
        
        
        //////////////////////////////////////////
        //ANSI378<>ANSI378
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											SGFDxSecurityLevel.SL_NORMAL,
											matched);
        debugMessage("MatchTemplateEx(ANSI1,ANSI1) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");

        //////////////////////////////////////////
        //ANSI378<>ISO19794
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											SGFDxSecurityLevel.SL_NORMAL,
											matched);
        debugMessage("MatchTemplateEx(ANSI2,ANSI2) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");
        
        
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											SGFDxSecurityLevel.SL_NORMAL,
											matched);
        debugMessage("MatchTemplateEx(ANSI1,ANSI2) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");

        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											SGFDxSecurityLevel.SL_NORMAL,
											matched);
        debugMessage("MatchTemplateEx(ANSI2,ANSI1) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");
        
        
        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ANSI1,ANSI1) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ANSI2,ANSI2) ret:" + error + ". \n\tScore:" + score[0] + "\n");
        
        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ANSI1,ANSI2) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									ansiTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ANSI2,ANSI1) ret:" + error + ". \n\tScore:" + score[0] + "\n");
        
        
        //////////////////////////////////////////
        //ISO19794COMPACT<>ISO19794COMPACT
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									isoCompactTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT,
											(long)0,
											isoCompactTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT,
											(long)0,
											SGFDxSecurityLevel.SL_NORMAL,
											matched);
        debugMessage("MatchTemplateEx(ISOCOMPACT,ISOCOMPACT) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									isoCompactTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT,
											(long)0,
											isoCompactTemplate2, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ISOCOMPACT,ISOCOMPACT) ret:" + error + ". \n\tScore:" + score[0] + "\n");
        
        //////////////////////////////////////////
        //SG400<>ANSI 
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									sgTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
        									(long)0,
        									ansiTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
        									(long)0,
        									SGFDxSecurityLevel.SL_NORMAL,
        									matched);
        debugMessage("MatchTemplateEx(SG4001,ANSI1) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									sgTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
											(long)0,
											ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(SG4001,ANSI1) ret:" + error + ". \n\tScore:" + score[0] + "\n");

        //////////////////////////////////////////
        //ANSI<>SG400 
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									ansiTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
        									(long)0,
        									sgTemplate1, 
        									SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
        									(long)0,
        									SGFDxSecurityLevel.SL_NORMAL,
        									matched);
        debugMessage("MatchTemplateEx(ANSI1,SG4001) ret:" + error + "\n");
        if (matched[0])
            debugMessage("\tMATCHED!!\n");
        else
            debugMessage("\tNOT MATCHED!!\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											sgTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_SG400,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ANSI1,SG4001) ret:" + error + ". \n\tScore:" + score[0] + "\n");
        
        
        //////////////////////////////////////////
        //ANSI378<>ISO19794
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											isoTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											SGFDxSecurityLevel.SL_NORMAL,
											matched);
        debugMessage("MatchTemplateEx(ANSI,ISO) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											isoTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ANSI,ISO) ret:" + error + ". \n\tScore:" + score[0] + "\n");
        
        //////////////////////////////////////////
        //ANSI378<>ISO19794COMPACT
        matched[0] = false;
        error = sgFplibSDKTest.MatchTemplateEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											isoCompactTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT,
											(long)0,
											SGFDxSecurityLevel.SL_NORMAL,
											matched);
        debugMessage("MatchTemplateEx(ANSI,ISOCOMPACT) ret:" + error + "\n");
        if (matched[0])
        	debugMessage("\tMATCHED!!\n");
        else
        	debugMessage("\tNOT MATCHED!!\n");

        score[0] = 0;
        error = sgFplibSDKTest.GetMatchingScoreEx(
        									ansiTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ANSI378,
											(long)0,
											isoCompactTemplate1, 
											SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794_COMPACT,
											(long)0,
											score);
        debugMessage("GetMatchingScoreEx(ANSI,ISOCOMPACT) ret:" + error + ". \n\tScore:" + score[0] + "\n");
        
        
        
        ///////////////////////////////////////////////////////////////////////////////////////////////        
    	//Reset extractor/matcher for attached device opened in resume() method
        ///////////////////////////////////////////////////////////////////////////////////////////////        
        error = sgFplibSDKTest.InitEx( mImageWidth, mImageHeight, 500);
        debugMessage("InitEx("+ mImageWidth + "," + mImageHeight + ",500) ret:" +  error + "\n");
        
        
        ///////////////////////////////////////////////////////////////////////////////////////////////        
        //Test WSQ Processing
        ///////////////////////////////////////////////////////////////////////////////////////////////        
        debugMessage("#######################\n");
        debugMessage("TEST WSQ COMPRESSION\n");        
        debugMessage("###\n###\n");
        byte[] wsqfinger1;
        int wsqLen;
        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.wsq2raw_finger);
            wsqLen = fileInputStream.available();
            debugMessage("WSQ file length is: " + wsqLen + "\n");
            wsqfinger1 = new byte[wsqLen];
        	error = fileInputStream.read(wsqfinger1);
            debugMessage("Read: " + error + "bytes\n");
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.wsq2raw_finger.\n");
        	return; 
        }

        
        int[] fingerImageOutSize = new int[1];
        dwTimeStart = System.currentTimeMillis();                 
        error = sgFplibSDKTest.WSQGetDecodedImageSize(fingerImageOutSize, wsqfinger1, wsqLen); 
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;
        debugMessage("WSQGetDecodedImageSize() ret:" +  error + "\n"); 
        debugMessage("\tRAW Image size is: " + fingerImageOutSize[0] + "\n");
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");
//      debugMessage("Byte 0:"+ String.format("%02X",wsqfinger1[0]) + "\n");
//      debugMessage("Byte 1:"+ String.format("%02X",wsqfinger1[1]) + "\n");
//      debugMessage("Byte 201:"+ String.format("%02X",wsqfinger1[201]) + "\n");
//      debugMessage("Byte 1566:"+ String.format("%02X",wsqfinger1[1566]) + "\n");
//      debugMessage("Byte 7001:"+ String.format("%02X",wsqfinger1[7001]) + "\n");
//      debugMessage("Byte 7291:"+ String.format("%02X",wsqfinger1[7291]) + "\n");        

        byte[] rawfinger1ImageOut = new byte[fingerImageOutSize[0]];
        int[] decodeWidth = new int[1];
        int[] decodeHeight = new int[1];
        int[] decodePixelDepth = new int[1];
        int[] decodePPI = new int[1];
        int[] decodeLossyFlag = new int[1];
        debugMessage("Decode WSQ File\n");     
        dwTimeStart = System.currentTimeMillis();                 
        error = sgFplibSDKTest.WSQDecode(rawfinger1ImageOut, decodeWidth, decodeHeight, decodePixelDepth, decodePPI, decodeLossyFlag, wsqfinger1, wsqLen);
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;
        debugMessage("\tret:\t\t\t"+ error + "\n"); 
        debugMessage("\twidth:\t\t"+ decodeWidth[0] + "\n"); 
        debugMessage("\theight:\t\t"+ decodeHeight[0] + "\n"); 
        debugMessage("\tdepth:\t\t"+ decodePixelDepth[0] + "\n"); 
        debugMessage("\tPPI:\t\t\t"+ decodePPI[0] + "\n");
        debugMessage("\tLossy Flag\t"+ decodeLossyFlag[0] + "\n");
        if ((decodeWidth[0] == 258) && (decodeHeight[0] == 336))
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");

	    mImageViewFingerprint.setImageBitmap(this.toGrayscale(rawfinger1ImageOut, decodeWidth[0], decodeHeight[0]));  
        

        byte[] rawfinger1;
        int encodeWidth=258;
        int encodeHeight=336;
        int encodePixelDepth=8;
        int encodePPI=500;
       		
        int rawLen;
        try {
            InputStream fileInputStream =getResources().openRawResource(R.raw.raw2wsq_finger);
            rawLen = fileInputStream.available();
            debugMessage("RAW file length is: " + rawLen + "\n");
            rawfinger1 = new byte[rawLen];
        	error = fileInputStream.read(rawfinger1);
            debugMessage("Read: " + error + "bytes\n");
            fileInputStream.close();
        } catch (IOException ex){
            debugMessage("Error: Unable to find fingerprint image R.raw.raw2wsq_finger.\n");
        	return; 
        }

        int[] wsqImageOutSize = new int[1];
        dwTimeStart = System.currentTimeMillis();                 
        error = sgFplibSDKTest.WSQGetEncodedImageSize(wsqImageOutSize, SGWSQLib.BITRATE_5_TO_1, rawfinger1, encodeWidth, encodeHeight, encodePixelDepth, encodePPI);
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;        
        debugMessage("WSQGetEncodedImageSize() ret:" +  error + "\n"); 
        debugMessage("WSQ Image size is: " + wsqImageOutSize[0] + "\n");
        if (wsqImageOutSize[0] == 20200)
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");

        byte[] wsqfinger1ImageOut = new byte[wsqImageOutSize[0]];
        dwTimeStart = System.currentTimeMillis();                 
        error = sgFplibSDKTest.WSQEncode(wsqfinger1ImageOut, SGWSQLib.BITRATE_5_TO_1, rawfinger1, encodeWidth, encodeHeight, encodePixelDepth, encodePPI);
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;        
        debugMessage("WSQEncode() ret:" +  error + "\n"); 
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");
     
        dwTimeStart = System.currentTimeMillis();                 
        error = sgFplibSDKTest.WSQGetDecodedImageSize(fingerImageOutSize, wsqfinger1ImageOut, wsqImageOutSize[0]); 
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;        
        debugMessage("WSQGetDecodedImageSize() ret:" +  error + "\n"); 
        debugMessage("RAW Image size is: " + fingerImageOutSize[0] + "\n");
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");
 
        byte[] rawfinger2ImageOut = new byte[fingerImageOutSize[0]];
        dwTimeStart = System.currentTimeMillis();                 
        error = sgFplibSDKTest.WSQDecode(rawfinger2ImageOut, decodeWidth, decodeHeight, decodePixelDepth, decodePPI, decodeLossyFlag, wsqfinger1, wsqLen);
        dwTimeEnd = System.currentTimeMillis();
        dwTimeElapsed = dwTimeEnd-dwTimeStart;                
        debugMessage("WSQDecode() ret:" +  error + "\n"); 
        debugMessage("\tret:\t\t\t"+ error + "\n"); 
        debugMessage("\twidth:\t\t"+ decodeWidth[0] + "\n"); 
        debugMessage("\theight:\t\t"+ decodeHeight[0] + "\n"); 
        debugMessage("\tdepth:\t\t"+ decodePixelDepth[0] + "\n"); 
        debugMessage("\tPPI:\t\t\t"+ decodePPI[0] + "\n");
        debugMessage("\tLossy Flag\t"+ decodeLossyFlag[0] + "\n");
        if ((decodeWidth[0] == 258) && (decodeHeight[0] == 336))
            debugMessage("\t+++PASS\n");
        else
            debugMessage("\t+++FAIL!!!!!!!!!!!!!!!!!!\n");
	    mImageViewFingerprint.setImageBitmap(this.toGrayscale(rawfinger2ImageOut, decodeWidth[0], decodeHeight[0])); 
        debugMessage("\t" + dwTimeElapsed +  " milliseconds\n");

        debugMessage("\n## END SDK TEST ##\n");
    }
    
    //////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////
    public void run() {
    	
    	//Log.d(TAG, "Enter run()");
        //ByteBuffer buffer = ByteBuffer.allocate(1);
        //UsbRequest request = new UsbRequest();
        //request.initialize(mSGUsbInterface.getConnection(), mEndpointBulk);
        //byte status = -1;
        while (true) {
        	
        	
            // queue a request on the interrupt endpoint
            //request.queue(buffer, 1);
            // send poll status command
          //  sendCommand(COMMAND_STATUS);
            // wait for status event
            /*
            if (mSGUsbInterface.getConnection().requestWait() == request) {
                byte newStatus = buffer.get(0);
                if (newStatus != status) {
                    Log.d(TAG, "got status " + newStatus);
                    status = newStatus;
                    if ((status & COMMAND_FIRE) != 0) {
                        // stop firing
                        sendCommand(COMMAND_STOP);
                    }
                }
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                }
            } else {
                Log.e(TAG, "requestWait failed, exiting");
                break;
            }
            */
        }
    }
}
package com.alcorlink.alcamsdk;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.usb.UsbDevice;
import android.os.AsyncTask;
import android.os.Environment;
import android.util.DisplayMetrics;
import android.view.WindowManager;


import com.alcorlink.camera.AKAVImage;
import com.alcorlink.camera.AKPU;
import com.alcorlink.camera.AKXUS;
import com.alcorlink.camera.AlCameraDevice;
import com.alcorlink.camera.AlDevManager;
import com.alcorlink.camera.AlErrorCode;
import com.alcorlink.camera.AlFrame;
import com.alcorlink.camera.CameraException;
import com.alcorlink.camera.StreamConfig;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.Iterator;

//RILEY
import SecuGen.Driver.SGLog;

public class SGDeviceHelper {

    private boolean isStreaming;
    private WeakReference<Context> mWeakContext;
    private UsbDevice mUsbdevice;
    private AlDevManager mCamManager;
    private AlCameraDevice mCamdev;
    private boolean onTheWayOpening;
    private boolean isOpen;

    private AKAVImage mAKImage;
    private AKPU mAKPU;
    private AKXUS mAKXUS;
    private ByteBuffer mRgbBuffer;
    private Bitmap mPreviewBitmap;
    private StreamConfig currentStreamCfg;
    private int TIMEOUT_MILLISECOND = 2000;
    private SGLog MyLog;

    public boolean isOnTheWayOpening() {
        return onTheWayOpening;
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public boolean isOpened(){
        return isOpen;
    }


    public SGDeviceHelper(Context ctx, UsbDevice udev, AlDevManager mng) {
        //MyLog.enter();
        mUsbdevice = udev;
        mWeakContext = new WeakReference<Context>(ctx);
        mCamManager = mng;
        onTheWayOpening = false;
        isOpen = false;
        isStream = false;
    }

    public Bitmap bitmapScaled(Context ctx, StreamConfig cfg) {
        final int outputHeight = getFitHeight(ctx, cfg);
        final int outputWidth = getFitWidth(ctx);
        Bitmap bmSmall = Bitmap.createScaledBitmap(mPreviewBitmap, outputWidth, outputHeight, true);
        return bmSmall;
    }

    public void close() {
        //RILEY MyLog.enter();
        if ( isOpen == false) {
            MyLog.d("It is closed already");
            return;
        }
        new TaskCloseCamera().execute();

    }

    public Bitmap decodeFrame(AlFrame frame) throws CameraException {
        if (currentStreamCfg.format == StreamConfig.VS_FORMAT_UNCOMPRESSED)
            return YUV2Bitmap(frame.getFrameByteArray(), currentStreamCfg);
        else if (currentStreamCfg.format == StreamConfig.VS_FORMAT_MJPEG)
            return Jpeg2Bitmap(frame);

        else {
            String s = "preview with " + StreamConfig.getFormatString(currentStreamCfg.format) + " is not implemented";
            throw new CameraException(s);
//            Toast.makeText(mAppCtx, s, Toast.LENGTH_SHORT).show();
        }

    }


    public AKAVImage getAKImage() {
        return mAKImage;
    }
    public AKPU getAKPU() {
        return mAKPU;
    }

    public AKXUS getAKXUS() {
        return mAKXUS;
    }

    public UsbDevice getUsbDev() {
        return mUsbdevice;
    }

    public String getUsbBcd() {
        try {
            return mCamdev.getUsbBCDDevice();
        } catch (CameraException e) {
            return " get UsbBcd fail " + e.toString();
        }

    }
    public StreamConfig getDefaultCfg(int format) throws CameraException{
        MyLog.d( "getDefaultCfg -");
        Iterator<StreamConfig> it = mAKImage.getStreamConfigList();
        /*use the first configuration as default*/
        StreamConfig cfg = null;

        while (it.hasNext()) {
            cfg = (StreamConfig) it.next();
            MyLog.d("streamId-" + cfg.streamId + " --format " + cfg.format + " config res=" + cfg.width + "x" + cfg.height);
            if (format!= 0 && cfg.format != format) {
                continue;
            }

            return cfg;
        }
        throw new CameraException("Format:"+StreamConfig.getFormatString(format)+" is not found");
    }

    public Iterator<StreamConfig> getStreamConfigList() {
        return mAKImage.getStreamConfigList();
    }


    public int getImage(AlFrame frame) {
        int result = 0;
        frame.validBufferLength = 0;

        result = mAKImage.getVideo(frame, TIMEOUT_MILLISECOND);
        if (frame.validBufferLength <= 0 || result != AlErrorCode.ERR_SUCCESS) {
            /*shows error ?*/
            return result;
        }


        return result;
    }



    public Bitmap detectFace(Bitmap bp) {
        return detectFace(bp);
    }


    private HashMap<String, StreamConfig> mConfigMap;

    public String[] getSortedResolutionArray() {
        MyLog.d("setResolutionArray");
        ResolutionSorting rs = getSortedResolutions();
        if (rs == null)
            return new String[]{"No Device"};
        String[] res;
        mConfigMap = rs.getSortMap();
        res = rs.getResolutionArray();
        return res;
    }



    private OnReadyCallback myDevReadyCallback;

/*
    public  void open( OnReadyCallback cb) {
        if ( isOpen == true) {
            MyLog.d("It is opened already");
            return;
        }
        onTheWayOpening = true;
        new TaskOpenCamera().execute(cb);
    }
*/
    public  void open( OnReadyCallback cb) {
        if ( isOpen == true) {
            MyLog.d("It is opened already");
            return;
        }
        onTheWayOpening = true;
        Integer result = TaskOpenCameraExecute();
        onTheWayOpening = false;
        if (result ==0)
        {
            isOpen = true;
        }
    }

    public int TaskOpenCameraExecute() {
            MyLog.d("TaskOpenCameraExecute");
            try {
                final Context context = mWeakContext.get();
                Boolean permit = new UsbPermissionHelper().requestPermissionBlocking(context, mUsbdevice);
                if (permit == false) {
                    MyLog.e("Permission deny");
                    throw new Exception("Permission deny");
                }
                mCamdev = mCamManager.createCameraDevice(mUsbdevice);
                mAKImage = mCamdev.getAKAVImage();
                mAKPU = mCamdev.getAKPU();
                mAKXUS = mCamdev.getAKXUS();

//                ResolutionSorting rs = getSortedResolutions();
//                String[] res = setResolutionArray(rs);
//                Iterator<StreamConfig> it = mAKImage.getStreamConfigList();
                    } catch (Exception e) {
                String s = "TaskOpenCamera fail " +e.toString();
                MyLog.e(s);
                /*Todo: show error*/
                return -1;
            }
            return 0;
    }


    private boolean isStream = false;
    public boolean isStreaming() {
        return isStream;
    }

    public void reset() throws CameraException {
        mCamdev.resetDevice();
    }

    public StreamConfig string2StreamConfig(String resString) {
        return mConfigMap.get(resString);
    }


    public void startCamera(StreamConfig cfg, OnReadyCallback cb, byte mode) {
        if (isStream == true) {
            MyLog.d("It is streaming already");
            return;
        }
        currentStreamCfg = cfg;

        TaskStartCamera tsk = new TaskStartCamera();
        tsk.streamMode = mode;
        tsk.execute(cb);

    }

    public void stopCamera( OnReadyCallback cb)  {
        MyLog.d("isStream="+isStream);
        if (isStream == false) {
            MyLog.d("It is already stopped");
            return;
        }

        new TaskStopCamera().execute(cb);
    }


    int index=0;
    public void saveImage(AlFrame frame) {
        long dataTake = System.currentTimeMillis();
        String filename = "AlcorCamera-" + Integer.toString(index++) + ".data";
        String savePath = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM).getAbsolutePath()+"/alcor/";
        File folder = new File(savePath);
        if (!folder.exists()) {
            folder.mkdir();
        }
        try {
            MyLog.d( "=====saving Path=" + savePath + "==========");
            FileOutputStream fout = new FileOutputStream(savePath + filename);
            BufferedOutputStream bos = new BufferedOutputStream(fout);
            bos.write(frame.getFrameByteArray(), 0, frame.validBufferLength);
            bos.flush();
            bos.close();
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }


    public Bitmap YUV2Bitmap(byte [] src, StreamConfig cfg) {
        int width = cfg.width;
        int height = cfg.height;

        if (mRgbBuffer == null || mRgbBuffer.capacity() < width * height * 4) {
            allocateRgbBuffer((int) (width * height * 4));
        }
        mRgbBuffer.rewind();
        Yuyv422toABGRY.yuyv422toABGRY(src, mRgbBuffer, width, height);
        if (mPreviewBitmap == null ||
                (mPreviewBitmap.getHeight() != height || mPreviewBitmap.getWidth() != width))
            createBitMap(width, height);

        mPreviewBitmap.copyPixelsFromBuffer(mRgbBuffer);
        return mPreviewBitmap;
    }



    public class TaskOpenCamera extends AsyncTask<OnReadyCallback, Void, Integer> {

        @Override
        protected Integer doInBackground(OnReadyCallback... params) {
            MyLog.d("TaskOpenCamera");
            OnReadyCallback callback = params[0];
            try {
                final Context context = mWeakContext.get();
                Boolean permit = new UsbPermissionHelper().requestPermissionBlocking(context, mUsbdevice);
                if (permit == false) {
                    MyLog.e("Permission deny");
                    throw new Exception("Permission deny");
                }
                mCamdev = mCamManager.createCameraDevice(mUsbdevice);
                mAKImage = mCamdev.getAKAVImage();
                mAKPU = mCamdev.getAKPU();
                mAKXUS = mCamdev.getAKXUS();
                if (callback != null)
                    callback.deviceReady(0);
//                ResolutionSorting rs = getSortedResolutions();
//                String[] res = setResolutionArray(rs);
//                Iterator<StreamConfig> it = mAKImage.getStreamConfigList();
            } catch (Exception e) {
                String s = "TaskOpenCamera fail " +e.toString();
                MyLog.e(s);
                /*Todo: show error*/
                return -1;
            }
            return 0;
        }

        @Override
        protected void onPostExecute(Integer result) {
            onTheWayOpening = false;
            if (result ==0)
            {
                isOpen = true;
            }
        }
    }

    public class TaskCloseCamera extends AsyncTask<Void, Void, Integer> {

        @Override
        protected Integer doInBackground(Void... voids) {
            MyLog.d("TaskCloseCamera");
            while(isStream == true) {
                MyLog.d("waiting...");
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    MyLog.w(e.toString());
                }
            }

            if (mCamdev != null)
                mCamdev.closeConnection();
            mCamdev = null;
            mAKImage = null;
            mAKPU = null;
            mAKXUS = null;
            mRgbBuffer = null;
            mPreviewBitmap = null;
            currentStreamCfg = null;
            return 0;
        }
        @Override
        protected void onPostExecute(Integer result) {
            isOpen = false;
        }
    }

    public class TaskStartCamera extends AsyncTask<OnReadyCallback, Void, Integer> {
        byte streamMode = SecuGenDevice.DEFAULT_PREVIEW_MODE;

        @Override
        protected Integer doInBackground(OnReadyCallback... params) {
            MyLog.d("TaskStartCamera");
            int ret =0;
            String s ="";
            OnReadyCallback callback = params[0];
            try {

                MyLog.d("cfg format =" + currentStreamCfg.format);
                mAKImage.videoStart(currentStreamCfg, streamMode);


            } catch (Exception e) {
                MyLog.e(e.toString());
                ret = -1;
            }
            if (callback != null)
                callback.deviceReady(ret);
            return ret;
        }


        @Override
        protected void onPostExecute(Integer result) {

            if (result ==0)
            {
                isStream = true;
            }
        }
    }

    private class TaskStopCamera extends AsyncTask<OnReadyCallback, Void, Integer> {
        @Override
        protected Integer doInBackground(OnReadyCallback... params) {
            MyLog.d("TaskStopCamera");
            OnReadyCallback callback = params[0];
            String s ="";
            try {
                mAKImage.videoStop(currentStreamCfg);
                if (callback != null)
                    callback.deviceReady(0);
                // stopCamera(currentStreamCfg);
            } catch (CameraException e) {
                e.printStackTrace();
            }

            return 0;
        }
        @Override
        protected void onPostExecute(Integer result) {
            isStream = false;
            if (result ==0)
            {
            }
        }
    }





    private void allocateRgbBuffer(int size) {
        mRgbBuffer = ByteBuffer.allocateDirect(size);//ARGB - 4 bytes for each pixel

    }

    private void createBitMap(int width, int height)
    {
        mPreviewBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    }
    private int getWindowsSize(int isWidth, Context ctx) {
        int size = 0;
        DisplayMetrics dm = new DisplayMetrics();
        WindowManager windowManager = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        windowManager.getDefaultDisplay().getMetrics(dm);
        switch (isWidth) {
            case 0:
                size = dm.heightPixels;
                break;
            case 1:
                size = dm.widthPixels;
                break;
        }
        return size;
    }

    static final int WIDTH = 1;
    static final int HEIGHT = 0;
    private final float DISPLAY_WIDTH_IN_WINDOWS = (float)1/2;

    private int getFitWidth(Context ctx) {
        int winWidth = getWindowsSize(WIDTH, ctx);
        return (int) (winWidth*DISPLAY_WIDTH_IN_WINDOWS);
    }


    private int getFitHeight(Context ctx, StreamConfig cfg) {
        int winH = getFitWidth(ctx);
        return (int) (winH* getDisplayRatio(cfg));
    }

    private float getDisplayRatio( StreamConfig cfg) {
        return (float)cfg.height/cfg.width;
    }

    private ResolutionSorting getSortedResolutions() {
        Iterator<StreamConfig> it = mAKImage.getStreamConfigList();
        ResolutionSorting rs = new ResolutionSorting(it, 0);
        return rs;
    }



    private Bitmap Jpeg2Bitmap(AlFrame frame) {
//        Bitmap bp = BitmapFactory.decodeByteArray(frame.getFrameByteArray(), 0, frame.validBufferLength);
        BitmapFactory.Options opt = new BitmapFactory.Options();
        opt.inMutable = true;
        opt.inPreferredConfig = Bitmap.Config.RGB_565;
//        opt.inJustDecodeBounds = true;
        Bitmap bp = BitmapFactory.decodeByteArray(frame.getFrameByteArray(), 0, frame.validBufferLength, opt);
        return bp;
    }





}

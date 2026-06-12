package com.alcorlink.alcamsdk;

import android.content.Context;
import android.content.res.AssetManager;

import com.alcorlink.camera.AKXUS;
import com.alcorlink.camera.CameraException;

import java.io.IOException;
import java.io.InputStream;
//RILEY
import SecuGen.Driver.SGLog;


public class FirmwareHelper {
    //public final String tag = MainActivity.tag;
    public final String tag = "FirmwareHelper";
    private static SGLog MyLog; //RILEY
    public FirmwareHelper()
    {

    }

    static public void upgrade(Context appCtx, AKXUS xu, String fwName) throws CameraException {
        byte  fwBytes[]  = getFirmwareBytes(appCtx, fwName);
        firmwareUpgrade(xu, fwBytes);
    }

    static private void firmwareUpgrade(AKXUS xu, byte []data) throws CameraException {
        int size = data.length;

        //RILEY MyLog.enter();
        xu.MpQueryExtRom();

        MyLog.d("======MpFwUpgrade=====>" + size + " bytes");
        xu.MpFwUpgrade( data, size, null);
        xu.MpFwCompare( data, size);
        //RILEY MyLog.leave();
    }


    static private byte[] getFirmwareBytes(Context appCtx, String fwName) {
        AssetManager am = appCtx.getAssets();
        try {
            InputStream in = am.open(fwName); // source instream
            int read;
            byte fwBytes[] = new byte [in.available()];
            int offset = 0;
            read = in.read(fwBytes);
            in.close();
            in = null;
            return fwBytes;

        } catch (IOException e) {

            e.printStackTrace();
        }
        return null;
    }


}

package com.alcorlink.alcamsdk;

import android.util.Log;

import java.nio.ByteBuffer;

public final class Yuyv422toABGRY {



	static private int y1192_tbl[];
	static private int v1634_tbl[];
	static private int v833_tbl[];
	static private int u400_tbl[];
	static private int u2066_tbl[];
	static private int yuv_tbl_ready=0;
	static final int MAX_WIDTH = 1920;
	static final int MAX_HEIGHT = 1080;
	static final int YUV_FACTOR = 2;
	static final int RGB_FACTOR = 4;
	static byte pData[]= new byte[MAX_WIDTH*MAX_HEIGHT*YUV_FACTOR];
	static byte pRGB[] = new byte [MAX_WIDTH*MAX_HEIGHT*RGB_FACTOR];

 
	
	static private void Yuyv422toABGRY_setup(){
		y1192_tbl = new int[256];
		v1634_tbl = new int[256];
		v833_tbl = new int[256];
		u400_tbl = new int[256];
		u2066_tbl = new int[256];
		for(int i=0 ; i<256 ; i++){
			y1192_tbl[i] = 1192*(i-16);
			if(y1192_tbl[i]<0){
				y1192_tbl[i]=0;
			}

			v1634_tbl[i] = 1634*(i-128);
			v833_tbl[i] = 833*(i-128);
			u400_tbl[i] = 400*(i-128);
			u2066_tbl[i] = 2066*(i-128);
		}
	}
	
	private static int ByteToUnsgined(int index)
	{
		if (index <0)
			return 256 + index;
		return index;
	}

	public static void yuyv422toABGRY(byte []source, ByteBuffer dest, int width, int height)
	{
		yuyv422toABGRYexecuteSecugen(source, dest, width, height);
	}



	private static void yuyv422toABGRYexecuteSecugen(byte []pSourceData, ByteBuffer dest, int width, int height)
	{
//		int frameSize =width*height*2;
		int frameSize =width*height;

		int i;
		//byte pSourceData[];
		//byte pRGB[];
		int offset = 0;
		//pSourceData = new byte[frameSize];
		//pRGB = new byte[frameSize*2];

		if(yuv_tbl_ready==0){
			try {
				Yuyv422toABGRY_setup();
			}
			catch (Exception e)
			{
			}
			yuv_tbl_ready = 1;
		}
		for(i=0 ; i<frameSize ; i+=4){
			int y1, y2, u, v;


			y1 = (0x000000ff)&pSourceData[i];
			u  =  (0x000000ff)&pSourceData[i+1];
			y2 = (0x000000ff)&pSourceData[i+2];
			v  =  (0x000000ff)&pSourceData[i+3];



			int y1192_1=y1192_tbl[(y1)];
			int r1 = (y1192_1 + v1634_tbl[(v)])>>10;
			int g1 = (y1192_1 - v833_tbl[(v)] - u400_tbl[(u)])>>10;
			int b1 = (y1192_1 + u2066_tbl[(u)])>>10;
			//	Log.e("test"," " +r1 + " " + g1 +" " + b1 );
			int y1192_2=y1192_tbl[(y2)];
			int r2 = (y1192_2 + v1634_tbl[(v)])>>10;
			int g2 = (y1192_2 - v833_tbl[(v)] - u400_tbl[(u)])>>10;
			int b2 = (y1192_2 + u2066_tbl[(u)])>>10;

			r1 = r1>255 ? 255 : r1<0 ? 0 : r1;
			g1 = g1>255 ? 255 : g1<0 ? 0 : g1;
			b1 = b1>255 ? 255 : b1<0 ? 0 : b1;
			r2 = r2>255 ? 255 : r2<0 ? 0 : r2;
			g2 = g2>255 ? 255 : g2<0 ? 0 : g2;
			b2 = b2>255 ? 255 : b2<0 ? 0 : b2;


			pRGB[offset++] = (byte)(r1);
			pRGB[offset++] =  (byte)( g1);
			pRGB[offset++] =  (byte)( b1);
			pRGB[offset++] =  (byte)( 255);

			pRGB[offset++] =  (byte)( r2);
			pRGB[offset++] =  (byte)( g2);
			pRGB[offset++] =  (byte)(b2);
			pRGB[offset++] =  (byte)( 255);

		}

		dest.put(pRGB, 0, frameSize*2);
		dest.rewind();
	}

	public static  void YUY2_RGB4(ByteBuffer source, ByteBuffer dest, int width, int height)
	{

		int frameSize =width*height*2;
		// R = Y + 1.403V'
		//G = Y - 0.344U' - 0.714V'
		//B = Y + 1.770U'

		int i;
		for( i=0;i<frameSize;i+=4)
		{
			//Y0 U0 Y1 V0

			float y1, y2, u, v;
			int offset = 0;
			y1 =(float) source.get(i);
			u  = (float) source.get(i+1);
			y2 = (float) source.get(i+2);
			v  =(float)  source.get(i+3);

			float R,G,B;

			R = (y1 + 1.403f*v); 
			G=(y1 - 0.344f*u-0.714f*v);   
			B=(y1 +1.77f*u); 
			if(R<0) R =0;
			if(R>255) R=255;
			if(G<0) G =0;
			if(G>255) G=255;
			if(B<0) B =0;
			if(B>255) B=255;

			dest.put((byte) R);
			dest.put((byte) G);
			dest.put((byte) B);
			dest.put((byte) 255);


			R = (y2 + 1.403f*v); 
			G=(y2 - 0.344f*u-0.714f*v);   
			B=(y2 +1.77f*u); 
			if(R<0) R =0;
			if(R>255) R=255;
			if(G<0) G =0;
			if(G>255) G=255;
			if(B<0) B =0;
			if(B>255) B=255;
			dest.put((byte) R);
			dest.put((byte) G);
			dest.put((byte) B);
			dest.put((byte) 255);
		}
	}

}

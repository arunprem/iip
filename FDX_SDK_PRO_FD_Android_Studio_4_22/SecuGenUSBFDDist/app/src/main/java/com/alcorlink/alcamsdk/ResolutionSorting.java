package com.alcorlink.alcamsdk;


import com.alcorlink.camera.StreamConfig;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;

public class ResolutionSorting {
    private Iterator<StreamConfig> itConfig;

    private HashMap<String, StreamConfig> sortMap;

    public HashMap<String, StreamConfig> getSortMap() {
        return sortMap;
    }

    public String[] getResolutionArray() {
        return resArray;
    }

    public List<StreamConfig> getSortList() {
        return sortList;
    }

    private String[] resArray;
    private List<StreamConfig> sortList;

    public ResolutionSorting(Iterator<StreamConfig> it , int streamFormat) {
        itConfig = it;
        HashMap<String, StreamConfig> map = createMap(streamFormat);
        sortList = sortList(map);
        sortMap = sortMap(sortList);

        resArray = returnStringArray(sortList);
    }

//    private HashMap<String, StreamConfig> mConfigMap;

    private HashMap<String, StreamConfig> createMap(int format)
    {
        HashMap<String, StreamConfig> map = new HashMap<String, StreamConfig>();
        String s = new String();

        while (itConfig.hasNext())
        {
            //sFormat = null;
            StreamConfig cfg = (StreamConfig) itConfig.next();
            if (cfg.format == format || format == 0) {//show all if format is 0
                s = streamCfg2StringIdentify(cfg);
                map.put(s, cfg);
            }
        }
        return map;
    }

    private final int FormatWeight = 1000*1000*100;
    private List<StreamConfig> sortList(HashMap<String, StreamConfig> map)
    {

        List<StreamConfig> configBySize = new ArrayList<StreamConfig>(map.values());
        Collections.sort(configBySize, new Comparator<StreamConfig>() {

            public int compare(StreamConfig o1, StreamConfig o2) {
                return (o1.format* FormatWeight +o1.height * o1.width) - (o2.format* FormatWeight +o2.height*o2.width);
            }
        });

        return configBySize;
    }

    private HashMap<String, StreamConfig> sortMap(List<StreamConfig> list) {
        HashMap<String, StreamConfig> map = new HashMap<String, StreamConfig>();
        for (StreamConfig cfg : list)
        {
            String s = streamCfg2StringIdentify(cfg);
            map.put(s, cfg);
        }
        return map;
    }

    private String[] returnStringArray(List<StreamConfig> list)
    {
        String[]res = null;

        int resCount = list.size();
        res = new String[resCount];
        int i = 0;
        for (StreamConfig cfg : list)
        {
            res[i] = streamCfg2StringIdentify(cfg);
            i ++;
        }
        return res;
    }

    public int indexOfConfig(StreamConfig cfg)
    {
        if (sortList == null)
            return -1;
        String target = streamCfg2StringIdentify(cfg);
        for (StreamConfig c: sortList)
        {
            String s = ResolutionSorting.streamCfg2StringIdentify(c);
            if (target.equals(s))
                return sortList.indexOf(c);
        }
        return -1;
    }

    public static String streamCfg2StringIdentify(StreamConfig cfg) {
        String sFormat = null;
        String s;
        sFormat =  StreamConfig.getFormatString(cfg.format);
        s = new String(sFormat +" "+cfg.width  + "x"+ cfg.height);
        return s;
    }

    public void destroy() {
        if (resArray!= null)
        {
            for (int i=0;i<resArray.length;i++)
            {
                resArray[i] = null;
            }
        }
        resArray = null;
        if (itConfig != null)
        {
            while (itConfig.hasNext())
            {
                //sFormat = null;
                StreamConfig cfg = (StreamConfig)itConfig.next();
                itConfig.remove();
            }
        }

        if (sortMap != null)
        {
            for (String cfg : sortMap.keySet()) {
                sortMap.remove(cfg);
            }
        }
        if (sortList != null) {
            for (StreamConfig cfg : sortList) {
                String s = streamCfg2StringIdentify(cfg);
               sortList.remove(cfg);
            }
        }

    }
}

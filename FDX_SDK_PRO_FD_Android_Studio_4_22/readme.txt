SecuGen FDx SDK PRO FD for Android 
Version 4.22
Date: October 30, 2025
#################################################################

================================================================ 
DISCLAIMER
================================================================= 
This SDK is provided as is and without warranty of any kind. 
The SDK may contain errors that could cause failures or loss of 
data, and may be incomplete or contain inaccuracies. By using this 
SDK, you expressly acknowledge and agree that use of the SDK is 
at your risk. 

================================================================ 
Release Notes:
================================================================= 
1. This SDK requires Android 8.1 or later (Oreo API Level 27)
2. This version supports the following SecuGen devices:
     USB Hamster PRO v2 VID:0x1162 PID:0x2310 (UPx-v2 class device)
     USB Hamster Air VID:0x1162 PID:0x2500 (Touchless device)
     USB Hamster PRO 20 VID:0x1162 PID:0x2240 (U20-A class device)
     USB Hamster PRO 20 VID:0x1162 PID:0x2220 (U20-AP class device)
     USB Hamster PRO 10 VID:0x1162 PID:0x2203 (U10 class device)
     USB Hamster PRO VID:0x1162 PID:0x2201 (UPx class device)
     USB Hamster PRO 20 VID:0x1162 PID:0x2200 (U20 class device)
     USB Hamster IV VID:0x1162 PID:0x2000 (SDU04P class device with WHITE LEDs)
     USB Hamster Plus VID:0x1162 PID:0x1000 (SDU03P class device)
3. This version has been tested with the following Android configurations:
     Samsung Galaxy S21 Ultra 5G - Android 11  	(ARM 64bit OS)
4. This version supports armeabi-v7a, arm64-v8a, x86 and x86_64 Android targets

================================================================= 
SYSTEM INSTALLATION NOTES
================================================================= 
1. Verify Android Host Compatibility
1.1 Android OS Version should be 8.1 or later
1.2 Follow the instructions in "Android_USB_Host_Diagnostics.pdf"
    to verify that your Android device has a functional USB
    host controller.
2. Demo Application
2.1 Copy SecuGenUSBFDAndroidStudio.apk to your Android device and install it
2.2 Plug in a supported SecuGen device.
2.3 Launch SecuGen.Demo.JSGDActivity.
3. Build environment
3.1 The Following tools were used
    Android Studio Meerkat v20244.3.2 on Ubuntu Linux
3.2 Open the "SecuGenUSBFDDist" project with Android Studio

================================================================= 
REVISIONS
================================================================= 
4.22 10/30/2025 - FIx image capture finger classifier bug
4.21 10/16/2025 - 16K Page size for native libraries
4.19 7/2/2025 -  Target Android API 35
4.18 1/28/2025 - Modified DX8000 capture buffer for U20
4.17 1/24/2025 - Added support for Ingenico DX8000
4.16 12/4/2024 - Fixed U20-AP driver bug
4.15 12/2/2024 - Build for Android Target API 34
4.14 11/6/2024 - Add support for UPx-AP fingerprint sensor
4.13 10/23/2024 - Fix for Unisoc processor
4.11 9/30/2024 - Fixed javadoc and file copy issue in build
4.10 9/26/2024 - Added support for Hamster Pro v2 (UPx-AP)
4.9 2/6/2024 - Google Play Update - Cosmetic changes
4.7 8/18/2023 - Google Play Release
4.6 12/20/2022 - Cleared crashing problem on Android 13
4.5 12/8/2022 - Upgraded to Android SDK 31 and Tools 30.0.3
4.4 8/1/2022 - Added support for U30
4.3 4/26/2022 - Release Build
4.3 BETA3 1/26/2022 - U20 Image Capture Improvements
4.3 BETA2 1/21/2022 - Fixed U20 Fake Detection Bug
4.3 BETA1 12/2/2021 - Added Support for U20-AP
4.2 RC3 10/28/2021 - Release Candidate 3 - Set transfer size to 10,240 all devices
4.2 RC2 10/26/2021 - Release Candidate 2 - doc update
4.2 RC1 10/26/2021 - Release Candidate 1 - bug fixes
4.2 Beta5 10/21/2021 - UI improvements
4.2 Beta4 10/21/2021 - Auto On enabled Hamster Air (U-Air)
4.2 Beta3 10/20/2021 - Bug fixes Hamster Air (U-Air)
4.2 Beta2 10/20/2021 - Improve image quality Hamster Air (U-Air)
4.2 Beta1 10/19/2021 - Added support Hamster Air (U-Air)
4.1 3/30/2021 - Added support for ISO Compact template with no header
4.0 12/9/2020 - Updated UI
4.0 Beta 8 7/15/2020 - Support Android Studio
4.0 Beta 7 2/14/2020 - Improve U20 image capture to improve fake rejection
4.0 Beta 6 2/3/2020 - Fix bug in U10 liveness detection
4.0 Beta 5 12/9/2019 - U20, U20-A and U20-AP supported in this release
4.0 Beta 4 11/29/2019 - Updated U10 liveness detection algorithm
4.0 Beta 3 10/29/2019 - Updated U10 liveness detection algorithm
4.0 Beta 2 9/3/2019 - Added U20-A and U20-AP device support
4.0 Beta 1 8/22/2019 - Merged MINEXIII Algorithm
2.0 Beta 2 9/13/2018 - Updated U20 data.
2.0 Beta 1 5/2/2018  - Added liveness detection algorithm for Hamster PRO 20.
1.28 3/28/2018 - Added support for Hamster PRO 10.
1.24 11/28/2017 - Added 64bit native libraries. Tested on 32bit only
                 Built and tested with Hamster PRO 20, Hamster PRO
                 Hamster IV and Hamster Plus
1.19 4/28/2017 - Fixed problem with NULL ISO templates
1.14 2/18/2017 - Added code for firmware update
1.13 11/22/2016- Added 64byte USB packet mode to clear horizontal line images
                 with Hamster Plus (SDU03P) on some devices. This mode enabled by 
                 calling WriteData(Constant.WRITEDATA_COMMAND_ENABLE_USB_MODE_64, 0x01)
1.12 11/02/2016- Remove libpng from WSQ native library
1.11 10/14/2016- Fix build. Missing armeabi libraries in v1.10
1.10 9/20/2016 - Moved SGNFIQ and SGWSQ object instantiation from SGFPLib constructor to 
                 respective method calls.
1.9 9/9/2016   - Added GetNumOfMinutiae() function
1.8 5/17/2016  - Added support for SecuGen Hamster PRO (HUPx)
1.7 11/3/2015  - Added APIs to NIST WSQ Encoding and Decoding
1.6 9/11/2015  - Added APIs to comput NIST Fingerprint Image Quality
                 Fixed bug preventing Smart Capture from being disabled with U20
1.5 5/15/2015  - Fixed memory leaks on instantiation and initialization 
                 of sgfplib object.
                 Added ReadSerialNumber() and WriteSerialNumber() APIs.
1.4 12/16/2014 - Improved display of fingerprint image in sample app.
                 Fixed thread not terminated issue when home button hit
                 with AUTO ON enabled.   
1.3 5/23/2014  - Added support for AUTO ON
                 Included Intel native libraries  (x86)  
1.2 4/30/2014  - Added support for Hamster PRO 20 (HU20)
1.1 11/6/2013  - Improved image quality with Hamster IV (SDU04P)
                 Improved display of captured images in sample application 
1.0 3/21/2013  - First Release
1.0 Beta2 3/5/2013  - Added InitEx() function
                      Improved SDU04P image quality
1.0 Beta1 1/22/2013 - Initial Release

    

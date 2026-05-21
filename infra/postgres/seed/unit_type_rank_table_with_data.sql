-- =============================================================
-- FILE: unit_type_rank_table_with_data.sql
-- Tables: unit_type (37 rows) + rank (147 rows)
-- Database: qdatakpapp_2025
-- Generated: 2026-05-21
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -------------------------------------------------------------
-- TABLE: unit_type
-- Description: Master list of unit category types
--              (e.g. PHQ, DISTRICT, PS, BATTALION, etc.)
-- -------------------------------------------------------------

DROP TABLE IF EXISTS `unit_type`;

CREATE TABLE `unit_type` (
  `idunittype`     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT 'Primary Key',
  `unit_type_desc` VARCHAR(255)    NULL                     COMMENT 'Full description of unit type',
  `status`         TINYINT         NOT NULL DEFAULT 1       COMMENT '1 = Active, 0 = Inactive',
  PRIMARY KEY (`idunittype`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data: 37 rows
INSERT INTO `unit_type` (`idunittype`, `unit_type_desc`, `status`) VALUES
( 1,  'PHQ',                  1),
( 2,  'SBCID',                1),
( 3,  'SCRB',                 1),
( 5,  'TELE',                 1),
( 7,  'PTC',                  1),
( 8,  'KEPA',                 1),
( 9,  'ZONE',                 1),
(10,  'RANGE',                1),
(11,  'DISTRICT',             1),
(12,  'AR',                   1),
(13,  'BATTALION',            1),
(14,  'DCRB',                 1),
(15,  'NARCOTIC CELL',        1),
(16,  'CRIME DETACHMENT',     1),
(17,  'DIST SB',              1),
(18,  'DIST ADMIN',           1),
(19,  'SDPO',                 1),
(20,  'CIRCLE',               1),
(21,  'PS',                   1),
(22,  'VACB',                 1),
(23,  'OTHER DEPT',           1),
(24,  'ROOT',                 0),
(26,  'COASTAL SECURITY',     1),
(27,  'CBCID',                1),
(28,  'TRAFFIC',              1),
(29,  'FSL',                  1),
(30,  'HIGH WAY POLICE',      1),
(31,  'TRAINING',             1),
(32,  'WOMEN CELL',           1),
(33,  'C-Room',               1),
(34,  'TOURISM',              1),
(35,  'CYBER CELL',           1),
(36,  'Mounted Police',       1),
(37,  'Temple',               1),
(38,  'FBP',                  1),
(39,  'PHOTOGRAPHIC BUREAU',  1),
(40,  'CRIME BRANCH',         1);


-- -------------------------------------------------------------
-- TABLE: rank
-- Description: Master list of police ranks with short tags,
--              head status, priority order, and active status.
-- -------------------------------------------------------------

DROP TABLE IF EXISTS `rank`;

CREATE TABLE `rank` (
  `idrank`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT 'Primary Key',
  `rank_desc`     VARCHAR(255)    NULL                     COMMENT 'Full rank description',
  `rank_short_tag` VARCHAR(100)   NULL                     COMMENT 'Short display tag / abbreviation',
  `unit_head`     TINYINT         NULL     DEFAULT 0       COMMENT '1 = Can be unit head',
  `rank_priority` INT             NULL     DEFAULT 0       COMMENT 'Display/sort priority (lower = senior)',
  `status`        TINYINT         NOT NULL DEFAULT 1       COMMENT '1 = Active, 0 = Inactive',
  PRIMARY KEY (`idrank`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data: 147 rows
INSERT INTO `rank` (`idrank`, `rank_desc`, `rank_short_tag`, `unit_head`, `rank_priority`, `status`) VALUES
(  1, 'DIRECTOR GENERAL OF POLICE',                          'DGP',                        1,  1, 1),
(  2, 'ADDITIONAL DIRECTOR GENERAL OF POLICE',               'ADGP',                       1,  2, 1),
(  3, 'INSPECTOR GENERAL OF POLICE',                         'IGP',                        1,  3, 1),
(  4, 'DEPUTY INSPECTOR GENERAL OF POLICE',                  'DIG',                        1,  4, 1),
(  5, 'SUPERINTENDENT OF POLICE ',                           'SP IPS',                     1,  5, 1),
(  6, 'SUPERINTENDENT OF POLICE (NON IPS)',                  'SP EX',                      1,  5, 1),
(  7, 'COMMANDANT(AR)',                                      'CMT AR',                     1,  5, 1),
(  8, 'COMMANDANT(BN)',                                      'CMT BN',                     1,  5, 1),
(  9, 'DEPUTY COMMANDANT(AR)',                               'DC AR',                      1,  6, 1),
( 10, 'ASSISTANT SUPERINTENDENT OF POLICE ',                 'ASP',                        1,  7, 1),
( 11, 'DEPUTY SUPERINTENDENT OF POLICE ',                    'DySP',                       1,  7, 1),
( 12, 'INSPECTOR',                                           'CI',                         1,  8, 1),
( 13, 'WOMAN INSPECTOR',                                     'WCI',                        1,  8, 1),
( 14, 'SUB INSPECTOR',                                       'SI',                         1,  9, 1),
( 15, 'WOMAN SUB INSPECTOR',                                 'WSI',                        1,  9, 1),
( 16, 'ASSISTANT SUB INSPECTOR',                             'ASI',                        0, 10, 1),
( 17, 'HEAD CONSTABLE',                                      'HC',                         0, 11, 1),
( 18, 'POLICE CONSTABLE',                                    'PC',                         0, 12, 1),
( 19, 'WOMAN HEAD CONSTABLE',                                'WHC',                        0, 11, 1),
( 20, 'WOMAN CONSTABLE',                                     'WPC',                        0, 12, 1),
( 21, 'ASSISTANT COMMANDANT(AR)',                            'AC AR',                      1,  7, 1),
( 22, 'INSPECTOR(RESERVE)',                                  'RI',                         0,  8, 1),
( 23, 'SUB INSPECTOR(RESERVE)',                              'RSI',                        0,  9, 1),
( 24, 'DRIVER SUB INSPECTOR',                                'Dvr SI',                     0,  9, 1),
( 25, 'RSI (DH) Upgraded post',                              'RSI DHUpd',                  0,  9, 1),
( 26, 'MT SI',                                               'MT SI',                      0,  9, 1),
( 27, 'ARMR SI',                                             'ARMR SI',                    0,  9, 1),
( 28, 'ASISTANT SUB INSPECTOR(RESERVE)',                     'RASI',                       0, 10, 1),
( 29, 'ARMR ASI',                                            'ARMR ASI',                   0, 10, 1),
( 30, 'HC AR',                                               'HC AR',                      0, 11, 1),
( 31, 'ARMR HC/ARMR HVL',                                   'ARMR HC',                    0, 11, 1),
( 33, 'PC AR',                                               'PC AR',                      0, 12, 1),
( 34, 'DVR HC/PC AR',                                        'DVR HC/PC AR',               0, 11, 1),
( 35, 'ARMR PC',                                             'ARMR PC',                    0, 12, 1),
( 38, 'DRUMMER',                                             'DRUMMER',                    0, 12, 1),
( 39, 'TAILOR',                                              'TAILOR',                     0, 12, 1),
( 40, 'ELECTRICIAN',                                         'ELECTRICIAN',                0, 12, 1),
( 41, 'PAINTER',                                             'PAINTER',                    0, 12, 1),
( 42, 'CARPENTER',                                           'CARPENTER',                  0, 12, 1),
( 43, 'MECHANIC',                                            'MECHANIC',                   0, 12, 1),
( 45, 'SENIOR AA',                                           'SENIOR AA',                  0,  7, 1),
( 46, 'AA',                                                  'AA',                         0,  8, 1),
( 47, 'AO',                                                  'AO',                         0,  8, 1),
( 49, 'JS',                                                  'JS',                         0,  9, 1),
( 50, 'SYSTEM ANALYST/PROGRAM MANAGER',                      'SA',                         0,  9, 1),
( 52, 'HEAD CLERK',                                          'HEAD CLERK',                 0, 10, 1),
( 53, 'UDC',                                                 'UDC',                        0, 11, 1),
( 54, 'LDC',                                                 'LDC',                        0, 11, 1),
( 55, 'CA',                                                  'CA',                         0,  8, 1),
( 56, 'FCS',                                                 'FCS',                        0,  9, 1),
( 57, 'SGT',                                                 'SGT',                        0,  9, 1),
( 58, 'UDT',                                                 'UDT',                        0, 11, 1),
( 60, 'PEON',                                                'PEON',                       0, 13, 1),
( 61, 'PHOTOGRAPHER',                                        'PHOTOGRAPHER',               1,  9, 1),
( 62, 'SCIENTIFIC ASST',                                     'SCIENTIFIC ASST',            0,  9, 1),
( 63, 'ASST SURGEON',                                        'ASST SURGEON',               0,  9, 1),
( 64, 'STAFF NURSE',                                         'STAFF NURSE',                0, 11, 1),
( 65, 'HEAD NURSE',                                          'HEAD NURSE',                 0, 10, 1),
( 66, 'NURSING ASST',                                        'NURSING ASST',               0, 13, 1),
( 71, 'PTS (HOSPITAL)',                                      'PTS (HOSPITAL)',              0, 13, 1),
( 72, 'CF BARBER',                                           'CF BARBER',                  0, 14, 1),
( 73, 'CF DHOBY',                                            'CF DHOBY',                   0, 14, 1),
( 74, 'CF COOK',                                             'CF COOK',                    0, 14, 1),
( 75, 'CF SWEEPER',                                          'CF SWEEPER',                 0, 14, 1),
( 76, 'DEPUTY COMMANDANT(BN)',                               'DC BN',                      0,  6, 1),
( 77, 'ASSISTANT COMMANDANT (BN)',                           'AC BN',                      1,  7, 1),
( 78, 'API ',                                                'API ',                       0,  8, 1),
( 79, 'MTI',                                                 'MTI',                        0,  8, 1),
( 80, 'ARMOUR  INSPECTOR',                                   'ARMOUR  INSPECTOR',          0,  8, 1),
( 81, 'API BAND',                                            'API BAND',                   0,  8, 1),
( 82, 'APSI/APSI(TRG POST)',                                 'APSI/APSI(TRG POST)',         0,  9, 1),
( 83, 'APSI BAND',                                          'APSI BAND',                  0,  9, 1),
( 88, 'AP ASI',                                              'AP ASI',                     0, 10, 1),
( 89, 'ASI MECHANIC(RW)',                                    'ASI MECHANIC(RW)',            0, 10, 1),
( 90, 'HAVILDAR',                                            'HDR ',                       0, 11, 1),
( 92, 'HDR BAND',                                            'HDR BAND',                   0, 11, 1),
( 93, 'RT WPC ',                                             'RT WPC ',                    0, 12, 1),
( 94, 'PC (BN)',                                             'PC (BN)',                     0, 12, 1),
( 97, 'RTPC',                                                'RTPC',                       0, 12, 1),
( 98, 'LATHE/OPR.PC(RW)',                                    'LATHE/OPR.PC(RW)',            0, 12, 1),
(100, 'WELDER(PC)',                                          'WELDER(PC)',                  0, 12, 1),
(106, 'BUGLER    PC',                                        'BUGLER    PC',               0, 12, 1),
(108, 'BLACKSMITH     PC',                                   'BLACKSMITH     PC',          0, 12, 1),
(112, 'CLEANER',                                             'CLEANER',                    0, 12, 1),
(113, 'HC MECHANIC/HVL MECHANIC',                            'HC MECHANIC/HVL MECHANIC',   0, 11, 1),
(114, 'FITTER      PC',                                      'FITTER      PC',             0, 12, 1),
(115, 'PC BAND',                                             'PC BAND',                    0, 12, 1),
(116, 'PTS',                                                 'PTS',                        0, 13, 1),
(118, 'MANAGER/SS/AO',                                       'MANAGER/SS/AO',              0,  8, 1),
(119, 'SGA',                                                 'SGA',                        0,  9, 1),
(120, 'ISA/HA/SA',                                           'ISA/HA/SA',                  0, 10, 1),
(121, 'CASHIER',                                             'CASHIER',                    0, 10, 1),
(129, 'LDT',                                                 'LDT',                        0, 11, 1),
(130, 'ATTENDER',                                            'ATTENDER',                   0, 13, 1),
(133, 'MACHINIST PC (RW)',                                   'MACHINIST PC (RW)',           0, 12, 1),
(134, 'RANGE WARDEN(RW)',                                    'RANGE WARDEN(RW)',            0, 12, 1),
(135, 'UPHOLSTER(RW)',                                       'UPHOLSTER(RW)',               0, 13, 1),
(137, 'ANM/JPH NURSE',                                       'ANM/JPH NURSE',              0, 11, 1),
(140, 'PHARMASIST',                                          'PHARMASIST',                 0, 11, 1),
(141, 'HOSPITAL ATTENDER GR.I',                              'HSP ATDR GR1',               0, 13, 1),
(142, 'HOSPITAL ATTENDER GR.II',                             'HSP ATDR GR2',               0, 13, 1),
(149, 'WATER CARRIER(CF)',                                   'WATER CARRIER(CF)',           0, 14, 1),
(150, 'SYSTEM ANALYST',                                      'SA',                         0,  5, 1),
(151, 'DIRECTOR FINGER PRINT',                               'DFPB',                       1,  5, 1),
(152, 'STASTICAL OFFICER',                                   'SO',                         0,  7, 1),
(153, 'UD COMPILER',                                         'UD COMPILER',                0, 11, 1),
(154, 'CHIEF PHOTO GRAPHER',                                 'CHIEF PHOTO GRAPHER',        0,  7, 1),
(156, 'DIRECTOR FSL',                                        'DIRECTOR FSL',               1,  5, 1),
(157, 'TESTER .INSP  (FPB)',                                 'TESTER IP FPB',              0,  8, 1),
(158, 'FP EXPERT',                                           'FP EXPERT',                  0,  9, 1),
(159, 'ASST.DIRECTOR, F.S.L',                                'ADR FSL',                    0,  7, 1),
(160, 'JT.DIRECTOR, F.S.L',                                  'JTR FSL',                    0,  7, 1),
(161, 'FP SEARCHER',                                         'FP SEARCHER',                0, 10, 1),
(162, 'P.T.EMPLOYEE',                                        'P.T.EMPLOYEE',               0, 13, 1),
(163, 'TECH.ATTENDER',                                       'TECH.ATTENDER',              0, 13, 1),
(164, 'SCIENTIFIC ASSISTANT, F.S.L',                         'SCIENTIFIC ASSISTANT, F.S.L',0,  9, 1),
(165, 'ASST. DIRECTOR (FINANCIAL & OFFICE PROCEDURE)',       'AST DIRECTOR (FOP)',         0,  7, 1),
(166, 'HEAD OF DEPT (FSL)',                                   'HOD FSL',                    0,  8, 1),
(167, 'HEAD OF DEPT (LAW)',                                   'HOD LAW',                    0,  8, 1),
(168, 'HEAD OF DEPT (BEHAVIOURAL SCIENCE)',                   'HOD BEHAVIOURAL SCIENCE',    0,  8, 1),
(169, 'HEAD OF DEPT (FORENSIC MEDICINE)',                     'HOD FORENSIC MEDICINE',      0,  8, 1),
(170, 'HEAD OF DEPT (COMPUTER APPL.)',                        'HOD CMPT APLN',              0,  8, 1),
(171, 'SENIOR INSTRUCTOR (FORENSIC SCIENCE)',                 'SNR INSTRUCTOR FSL',         0,  9, 1),
(172, 'SENIOR LECTURER (COMPUTER SCIENCE)',                   'SNR LECTURER CS',            0,  9, 1),
(173, 'CRIMINOLOGIST',                                       'CRIMINOLOGIST',              0,  9, 1),
(174, 'SR.LAW INSTRUCTOR ( C. I )',                          'SR.LAW INSTRUCTOR ( C. I )', 0,  8, 1),
(175, 'CINE OPERATOR',                                       'CINE OPERATOR',              0, 13, 1),
(176, 'LIBRARARIAN',                                         'LIBRARARIAN',                0, 13, 1),
(177, 'BINDER',                                              'BINDER',                     0, 13, 1),
(178, 'DRAFTS MAN',                                          'DRAFTS MAN',                 0, 13, 1),
(179, 'SHORT HAND REPORTER',                                 'SHORT HR',                   0,  8, 1),
(180, 'FCS SB',                                              'FCS SB',                     0, 11, 1),
(181, 'LASCAR',                                              'LASCAR',                     0, 13, 1),
(182, 'MEDICO LEGAL ADVISOR',                                'MEDICO LEGAL ADVSR',         0,  8, 1),
(183, 'REPORTER(II)SHB',                                     'REPORTER(II)SHB',            0, 11, 1),
(184, 'COBBLER(MP)',                                         'COBBLER(MP)',                0, 13, 1),
(185, 'LAB  TECHNICHIAN',                                    'LAB  TECH',                  0, 13, 1),
(186, 'GARDNER',                                             'GARDNER',                    0, 13, 1),
(187, 'PC(ORCH)',                                            'PC(ORCH)',                   0, 12, 1),
(189, 'SP (TELE)',                                           'SP (TELE)',                  1,  5, 1),
(190, 'DEPUTY SUPERINTENDENT OF POLICE (TELE)',              'DySP TELE',                  0,  7, 1),
(191, 'INSPECTOR OF POLICE(TELE)',                           'IP TELE',                    1,  8, 1),
(192, 'SUB INSPECTOR OF POLICE (TELE)',                      'SI TELE',                    0,  9, 1),
(194, 'ASSISTANT SUB INSPECTOR OF POLICE(TELE)',             'ASI TELE',                   0, 10, 1),
(195, 'HEAD CONSTABLE (TELE)',                               'HC TELE',                    0, 11, 1),
(197, 'POLICE CONSTABLE (TELE)',                             'PC TELE',                    0, 12, 1),
(198, 'Special Police Officer',                              'SPO',                        NULL, 0, 1);

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================
-- QUICK REFERENCE
-- =============================================================
-- unit_type: idunittype 11=DISTRICT, 21=PS, 20=CIRCLE, 19=SDPO,
--            13=BATTALION, 9=ZONE, 10=RANGE, 12=AR, 40=CRIME BRANCH
-- rank:      Seniority by rank_priority ASC (1=DGP ... 14=CF roles)
--            unit_head=1 means eligible to be a unit head
-- =============================================================

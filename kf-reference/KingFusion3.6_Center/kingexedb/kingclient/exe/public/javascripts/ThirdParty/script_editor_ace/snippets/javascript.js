ace.define("ace/snippets/javascript",["require","exports","module"],function(n,e,t){"use strict";e.snippetText=`# Prototype
snippet proto
	\${1:class_name}.prototype.\${2:method_name} = function(\${3:first_argument}) {
		\${4:// body...}
	};
# Function
snippet fun
	function \${1?:function_name}(\${2:argument}) {
		\${3:// body...}
	}
# Anonymous Function
regex /((=)\\s*|(:)\\s*|(\\()|\\b)/f/(\\))?/
snippet f
	function\${M1?: \${1:functionName}}($2) {
		\${0:$TM_SELECTED_TEXT}
	}\${M2?;}\${M3?,}\${M4?)}
# Immediate function
trigger \\(?f\\(
endTrigger \\)?
snippet f(
	(function(\${1}) {
		\${0:\${TM_SELECTED_TEXT:/* code */}}
	}(\${1}));
# if
snippet if
	if (\${1:true}) {
		\${0}
	}
# if ... else
snippet ife
	if (\${1:true}) {
		\${2}
	} else {
		\${0}
	}
# tertiary conditional
snippet ter
	\${1:/* condition */} ? \${2:a} : \${3:b}
# switch
snippet switch
	switch (\${1:expression}) {
		case '\${3:case}':
			\${4:// code}
			break;
		\${5}
		default:
			\${2:// code}
	}
# case
snippet case
	case '\${1:case}':
		\${2:// code}
		break;
	\${3}

# while (...) {...}
snippet wh
	while (\${1:/* condition */}) {
		\${0:/* code */}
	}
# try
snippet try
	try {
		\${0:/* code */}
	} catch (e) {}
# do...while
snippet do
	do {
		\${2:/* code */}
	} while (\${1:/* condition */});
# Object Method
snippet :f
regex /([,{[])|^\\s*/:f/
	\${1:method_name}: function(\${2:attribute}) {
		\${0}
	}\${3:,}
# setTimeout function
snippet setTimeout
regex /\\b/st|timeout|setTimeo?u?t?/
	setTimeout(function() {\${3:$TM_SELECTED_TEXT}}, \${1:10});
# Get Elements
snippet gett
	getElementsBy\${1:TagName}('\${2}')\${3}
# Get Element
snippet get
	getElementBy\${1:Id}('\${2}')\${3}
# Get Element
snippet MyElements
	MyElementsBy\${1:TagName}('\${2}')\${3}
# console.log (Firebug)
snippet cl
	console.log(\${1});
# return
snippet ret
	return \${1:result}
# for (property in object ) { ... }
snippet fori
	for (var \${1:prop} in \${2:Things}) {
		\${0:$2[$1]}
	}
# hasOwnProperty
snippet has
	hasOwnProperty(\${1})
# docstring
snippet /**
	/**
	 * \${1:description}
	 *
	 */
snippet @par
regex /^\\s*\\*\\s*/@(para?m?)?/
	@param {\${1:type}} \${2:name} \${3:description}
snippet @ret
	@return {\${1:type}} \${2:description}
# JSON.parse
snippet jsonp
	JSON.parse(\${1:jstr});
# JSON.stringify
snippet jsons
	JSON.stringify(\${1:object});
# self-defining function
snippet sdf
	var \${1:function_name} = function(\${2:argument}) {
		\${3:// initial code ...}

		$1 = function($2) {
			\${4:// main code}
		};
	}
# singleton
snippet sing
	function \${1:Singleton} (\${2:argument}) {
		// the cached instance
		var instance;

		// rewrite the constructor
		$1 = function $1($2) {
			return instance;
		};
		
		// carry over the prototype properties
		$1.prototype = this;

		// the instance
		instance = new $1();

		// reset the constructor pointer
		instance.constructor = $1;

		\${3:// code ...}

		return instance;
	}
# class
snippet class
regex /^\\s*/clas{0,2}/
	var \${1:class} = function(\${20}) {
		$40$0
	};
	
	(function() {
		\${60:this.prop = ""}
	}).call(\${1:class}.prototype);
	
	exports.\${1:class} = \${1:class};
# 
snippet for-
	for (var \${1:i} = \${2:Things}.length; \${1:i}--; ) {
		\${0:\${2:Things}[\${1:i}];}
	}
# for (...) {...}
snippet for
	for (var \${1:i} = 0; $1 < \${2:Things}.length; $1++) {
		\${3:$2[$1]}$0
	}
# for (...) {...} (Improved Native For-Loop)
snippet forr
	for (var \${1:i} = \${2:Things}.length - 1; $1 >= 0; $1--) {
		\${3:$2[$1]}$0
	}


#modules
snippet def
	define(function(require, exports, module) {
	"use strict";
	var \${1/.*\\///} = require("\${1}");
	
	$TM_SELECTED_TEXT
	});
snippet req
guard ^\\s*
	var \${1/.*\\///} = require("\${1}");
	$0
snippet requ
guard ^\\s*
	var \${1/.*\\/(.)/\\u$1/} = require("\${1}").\${1/.*\\/(.)/\\u$1/};
	$0


// #QueryRTOByGeographySpace
// snippet QueryRTOByGeographySpace
// 	QueryRTOByGeographySpace(\${1:SpaceName}, \${2:ModelName}, \${3:Filter}, \${4:result});
// #QueryRTOByGeoPosition
// snippet QueryRTOByGeoPosition
// 	QueryRTOByGeoPosition(\${1:PositionName}, \${2:ModelName}, \${3:Filter}, \${4:result});
// #SubscribeRTOByGeoSpace
// snippet SubscribeRTOByGeoSpace
// 	SubscribeRTOByGeoSpace(\${1:SpaceName}, \${2:ModelName}, \${3:EventscriptName}, \${4:Filter}, \${5:enable});
// #SubscribeRTOByGeoPosition
// snippet SubscribeRTOByGeoPosition
// 	SubscribeRTOByGeoPosition(\${1:PositionName}, \${2:ModelName}, \${3:EventscriptName}, \${4:Filter}, \${5:enable});
// #UpdateRTO
// snippet UpdateRTO
// 	UpdateRTO(\${1:dataObjectJson});
// #LockRTO
// snippet LockRTO
// 	LockRTO(\${1:dataObjectJson});
// #UnLockRTO
// snippet UnLockRTO
// 	UnLockRTO(\${1:dataObjectJson});
// #WriteRTO
// snippet WriteRTO
// 	WriteRTO(\${1:DatasetName});


// #QueryHISOByGeoSpace
// snippet QueryHISOByGeoSpace
// 	QueryHISOByGeoSpace(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${6:EndTime}, \${7:Filter}, \${8:result});
// #QueryHISOByGeoPosition
// snippet QueryHISOByGeoPosition
// 	QueryHISOByGeoPosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${6:EndTime}, \${7:Filter}, \${8:result});
// #QueryHISOByGeoSpaceAndTimePosition
// snippet QueryHISOByGeoSpaceAndTimePosition
// 	QueryHISOByGeoSpaceAndTimePosition(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:Filter}, \${7:result});
// #QueryHISOByGeoPositionAndTimePosition
// snippet QueryHISOByGeoPositionAndTimePosition
// 	QueryHISOByGeoPositionAndTimePosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:Filter}, \${7:result});
// #SubscribeHISOByGeoSpace
// snippet SubscribeHISOByGeoSpace
// 	SubscribeHISOByGeoSpace(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${5:EndTime}, \${6:EventscriptName}, \${7:Filter}, \${8:enable});
// #SubscribeHISOByGeoPosition
// snippet SubscribeHISOByGeoPosition
// 	SubscribeHISOByGeoPosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${6:EndTime}, \${7:EventscriptName}, \${8:Filter}, \${9:enable});
// #SubscribeHISOByGeoSpaceAndTimePosition
// snippet SubscribeHISOByGeoSpaceAndTimePosition
// 	SubscribeHISOByGeoSpaceAndTimePosition(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:EventscriptName}, \${7:Filter}, \${8:enable});
// #SubscribeHISOByGeoPositionAndTimePosition
// snippet SubscribeHISOByGeoPositionAndTimePosition
// 	SubscribeHISOByGeoPositionAndTimePosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:EventscriptName}, \${7:Filter}, \${8:enable});
// #UpdateHISO
// snippet UpdateHISO
// 	UpdateHISO(\${1:dataObjectJson});
// #HistoricalDBAddObjData
// snippet HistoricalDBAddObjData
// 	HistoricalDBAddObjData(\${1:dataObjectJson});
// #HistoricalDBDeleteObjData
// snippet HistoricalDBDeleteObjData
// 	HistoricalDBDeleteObjData(\${1:dataObjectJson});


// #QueryPLOByGeoSpace
// snippet QueryPLOByGeoSpace
// 	QueryPLOByGeoSpace(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${6:EndTime}, \${7:Filter}, \${8:result});
// #QueryPLOByGeoPosition
// snippet QueryPLOByGeoPosition
// 	QueryPLOByGeoPosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${6:EndTime}, \${7:Filter}, \${8:result});
// #QueryPLOByGeoSpaceAndTimePosition
// snippet QueryPLOByGeoSpaceAndTimePosition
// 	QueryPLOByGeoSpaceAndTimePosition(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:Filter}, \${7:result});
// #QueryPLOByGeoPositionAndTimePosition
// snippet QueryPLOByGeoPositionAndTimePosition
// 	QueryPLOByGeoPositionAndTimePosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:Filter}, \${7:result});
// #SubscribePLOByGeoSpace
// snippet SubscribePLOByGeoSpace
// 	SubscribePLOByGeoSpace(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${5:EndTime}, \${6:EventscriptName}, \${7:Filter}, \${8:enable});
// #SubscribePLOByGeoPosition
// snippet SubscribePLOByGeoPosition
// 	SubscribePLOByGeoPosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:nTimeRelation}, \${5:StartTime}, \${6:EndTime}, \${7:EventscriptName}, \${8:Filter}, \${9:enable});
// #SubscribePLOByGeoSpaceAndTimePosition
// snippet SubscribePLOByGeoSpaceAndTimePosition
// 	SubscribePLOByGeoSpaceAndTimePosition(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:EventscriptName}, \${7:Filter}, \${8:enable});
// #SubscribePLOByGeoPositionAndTimePosition
// snippet SubscribePLOByGeoPositionAndTimePosition
// 	SubscribePLOByGeoPositionAndTimePosition(\${1:PositionName}, \${2:SpecifiedModel}, \${3:nDataVersion}, \${4:STimePosition}, \${5:ETimePosition}, \${6:EventscriptName}, \${7:Filter}, \${8:enable});
// #UpdatePLO
// snippet UpdatePLO
// 	UpdatePLO(\${1:dataObjectJson});
// #HistoricalDBAddObjData
// snippet HistoricalDBAddObjData
// 	HistoricalDBAddObjData(\${1:dataObjectJson});
// #HistoricalDBDeleteObjData
// snippet HistoricalDBDeleteObjData
// 	HistoricalDBDeleteObjData(\${1:dataObjectJson});


#QueryModelByModelType
snippet QueryModelByModelType
	QueryModelByModelType(\${1:nModelType}, \${2:result});
#QueryModelByModelName
snippet QueryModelByModelName
	QueryModelByModelName(\${1:SpecifiedModel}, \${2:nModelType}, \${3:result});
#QueryChildModel
snippet QueryChildModel
	QueryChildModel(\${1:ModelName}, \${2:nModelType}, \${3:result});
#QueryObjectDef
snippet QueryObjectDef
	QueryObjectDef(\${1:SpecifiedModel}, \${2:nModelType}, \${3:type});
#ActiveObjectDef
snippet ActiveObjectDef
	ActiveObjectDef(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:nModelType});
#ActiveAllObjectDef
snippet ActiveAllObjectDef
	ActiveAllObjectDef(\${1:SpecifiedModel}, \${2:ModelType});
#UnActiveObjectDef
snippet UnActiveObjectDef
	UnActiveObjectDef(\${1:SpaceName}, \${2:SpecifiedModel}, \${3:ModelType});
#UnActiveAllObjectDef
snippet UnActiveAllObjectDef
	UnActiveAllObjectDef(\${1:SpecifiedModel}, \${2:ModelType});
#UpdateObjectDef
snippet UpdateObjectDef
	UpdateObjectDef(\${1:dataObjectJson});
#AddObjectDef
snippet AddObjectDef
	AddObjectDef(\${1:dataObjectJson});
#DeleteObjectDef
snippet DeleteObjectDef
	DeleteObjectDef(\${1:dataObjectJson});


#CreateGraphicObject
snippet CreateGraphicObject
	CreateGraphicObject(\${1:ModelName}, \${2:objectName}, \${3:left}, \${4:top}, \${5:width}, \${6:height}, \${7:z-order}, \${8:visible}, \${9:spaceName});
#CreateGraphicObjectByLayout
snippet CreateGraphicObjectByLayout
	CreateGraphicObjectByLayout(\${1:ModelName}, \${2:objectName}, \${3:containerName}, \${4:z-order}, \${5:visible});
#DeleteGraphicObjectByName
snippet DeleteGraphicObjectByName
	DeleteGraphicObjectByName(\${1:ModelName}, \${2:GraphicObjectName});
#DeleteGraphicObjectByGeoSpace
snippet DeleteGraphicObjectByGeoSpace
	DeleteGraphicObjectByGeoSpace(\${1:ModelName}, \${2:SpaceName}, \${3:DataObjectName});
#GetGraphicObjectCount
snippet GetGraphicObjectCount
	GetGraphicObjectCount(\${1:ModelName});
#GetGraphicObjectAttributeByIndex
snippet GetGraphicObjectAttributeByIndex
	GetGraphicObjectAttributeByIndex(\${1:ModelName}, \${2:Index}, \${3:AttributeName});
#GetGraphicObjectAttributeByName
snippet GetGraphicObjectAttributeByName
	GetGraphicObjectAttributeByName(\${1:ModelName}, \${2:ObjectName}, \${3:AttributeName});
#SetGraphicObjectAttributeByIndex
snippet SetGraphicObjectAttributeByIndex
	SetGraphicObjectAttributeByIndex(\${1:ModelName}, \${2:Index}, \${3:AttributeName}, \${4:value});
#SetGraphicObjectAttributeByName
snippet SetGraphicObjectAttributeByName
	SetGraphicObjectAttributeByName(\${1:ModelName}, \${2:ObjectName}, \${3:AttributeName}, \${4:value});
#AttachRTO
snippet AttachRTO
	AttachRTO(\${1:ModelName}, \${2:GraphicobjectName}, \${3:GeoSpace}, \${4:DataObjectName});
#AttachHISO
snippet AttachHISO
	AttachHISO(\${1:ModelName}, \${2:GraphicobjectName}, \${3:GeoSpace}, \${4:DataObjectName}, \${5:TimePosition}, \${6:DataVersion});
#AttachPLO
snippet AttachPLO
	AttachPLO(\${1:ModelName}, \${2:GraphicobjectName}, \${3:GeoSpace}, \${4:DataObjectName}, \${5:TimePosition}, \${6:DataVersion});


#SwichUser
snippet SwichUser
	SwichUser();
#GetCurrentUser
snippet GetCurrentUser
	GetCurrentUser();
#ChangeCurrentUserPassword
snippet ChangeCurrentUserPassword
	ChangeCurrentUserPassword();
#LogOff
snippet LogOff
	LogOff();
#LogOn
snippet LogOn
	LogOn();
#LogOnNoInput
snippet LogOnNoInput
	LogOnNoInput(\${1:strUnitName}, \${2:strUserName}, \${3:strPassword});


// #ShowPage
// snippet ShowPage
// 	ShowPage(\${1:strPageName});
// #ClosePage
// snippet ClosePage
// 	ClosePage(\${1:strPageName});
// #HidePage
// snippet HidePage
// 	HidePage(\${1:strPageName});
#GetPageScrollXPos
snippet GetPageScrollXPos
	GetPageScrollXPos(\${1:strPageName});
#GetPageScrollYPos
snippet GetPageScrollYPos
	GetPageScrollYPos(\${1:strPageName});
#GetPageStatus
snippet GetPageStatus
	GetPageStatus(\${1:strPageName});
#PreViewWholePage
snippet PreViewWholePage
	PreViewWholePage(\${1:strPageName}, \${2:ScaleX}, \${3:ScaleY}, \${4:Option}, \${5:StartX}, \${6:StartY});
#PreviewWindow
snippet PreviewWindow
	PreviewWindow(\${1:strPageName}, \${2:ScaleX}, \${3:ScaleY}, \${4:Option}, \${5:StartX}, \${6:StartY});
#PrintWholePage
snippet PrintWholePage
	PrintWholePage(\${1:strPageName}, \${2:ScaleX}, \${3:ScaleY}, \${4:Option}, \${5:StartX}, \${6:StartY});
#PrintWindow
snippet PrintWindow
	PrintWindow(\${1:strPageName}, \${2:ScaleX}, \${3:ScaleY}, \${4:Option}, \${5:StartX}, \${6:StartY});
#PrintScreenSet
snippet PrintScreenSet
	PrintScreenSet();
#PrintPageSet
snippet PrintPageSet
	PrintPageSet();
#SaveCurWindowToFile
snippet SaveCurWindowToFile
	SaveCurWindowToFile(\${1:strFileName});
#SaveCurWindowToFile1
snippet SaveCurWindowToFile1
	SaveCurWindowToFile1();
#SavePageToFile
snippet SavePageToFile
	SavePageToFile(\${1:strPageName}, \${2:Left}, \${3:Top}, \${4:Width}, \${5:Height}, \${6:strFileName});
#SavePageToFile1
snippet SavePageToFile1
	SavePageToFile1(\${1:strPageName}, \${2:Left}, \${3:Top}, \${4:Width}, \${5:Height});
#SaveWholePageToFile
snippet SaveWholePageToFile
	SaveWholePageToFile(\${1:strPageName}, \${2:strFileName});
#SaveWholePageToFile1
snippet SaveWholePageToFile1
	SaveWholePageToFile1(\${1:strPageName});
#SaveCurScreenToFile
snippet SaveCurScreenToFile
	SaveCurScreenToFile();
#SaveCurScreenToFile1
snippet SaveCurScreenToFile1
	SaveCurScreenToFile1(\${1:strFileName});
#ScrollPage
snippet ScrollPage
	ScrollPage(\${1:strFileName}, \${2:Left}, \${3:Top});
#GetPageWindowViewScale
snippet GetPageWindowViewScale
	GetPageWindowViewScale(\${1:strPageName});
#WindowSize
snippet WindowSize
	WindowSize(\${1:nFlag});
#SetPicToScreenCenter
snippet SetPicToScreenCenter
	SetPicToScreenCenter(\${1:strPageName});
#PrintScreen
snippet PrintScreen
	PrintScreen(\${1:XAxis}, \${2:YAxis}, \${3:Width}, \${4:Length}, \${5:ScaleX}, \${6:ScaleY}, \${7:Option}, \${8:StartX}, \${9:StartY});


#StrASCII
snippet StrASCII
	StrASCII(\${1:Str});
#StrChar
snippet StrChar
	StrChar(\${1:nCode});
#StrFromInt
snippet StrFromInt
	StrFromInt(\${1:nInteger}, \${2:nbase});
#StrFromReal
snippet StrFromReal
	StrFromReal(\${1:dbReal}, \${2:nPrecision}, \${3:strType});
#StrFromTime
snippet StrFromTime
	StrFromTime(\${1:nTime}, \${2:nStrType});
#StrInStr
snippet StrInStr
	StrInStr(\${1:strText}, \${2:strSearch}, \${3:nStartPos}, \${4:nCaseSens});
#StrLeft
snippet StrLeft
	StrLeft(\${1:strText}, \${2:nCount});
#StrLen
snippet StrLen
	StrLen(\${1:strText});
#StrLower
snippet StrLower
	StrLower(\${1:strText});
#StrMid
snippet StrMid
	StrMid(\${1:strText});
#StrReplace
snippet StrReplace
	StrReplace(\${1:strText}, \${2:strSearch}, \${3:strReplace}, \${4:nCaseSens}, \${5:nNumToReplace}, \${6:nMatch});
#StrRight
snippet StrRight
	StrRight(\${1:strText}, \${2:nCount});
#StrSpace
snippet StrSpace
	StrSpace(\${1:nNumSpaces});
#StrToInt
snippet StrToInt
	StrToInt(\${1:strText});
#StrToReal
snippet StrToReal
	StrToReal(\${1:strText});
#StrToTime
snippet StrToTime
	StrToTime(\${1:strDateTime});
#StrTrim
snippet StrTrim
	StrTrim(\${1:strText}, \${2:nTrimType});
#StrType
snippet StrType
	StrType(\${1:strText}, \${2:nTestType});
#StrUpper
snippet StrUpper
	StrUpper(\${1:strText});
#Text
snippet Text
	Text(\${1:dValue}, \${2:strFormat});


#ConvertTimeToSecond
snippet ConvertTimeToSecond
	ConvertTimeToSecond(\${1:nYear}, \${2:nMonth}, \${3:nDay}, \${4:nHour}, \${5:nMinute}, \${6:nSecond}, \${7:bMode});
#GetCustomDateString
snippet GetCustomDateString
	GetCustomDateString(\${1:nYear}, \${2:nMonth}, \${3:nDay}, \${4:bMode});
#GetCustomTimeString
snippet GetCustomTimeString
	GetCustomTimeString(\${1:nHour}, \${2:nMinute}, \${3:nSecond}, \${4:nType});
#GetLocalDateTimeFromSecond
snippet GetLocalDateTimeFromSecond
	GetLocalDateTimeFromSecond(\${1:nDateTime}, \${2:Year} \${3:Month}, \${4:Day}, \${5:Hour}, \${6:Minute}, \${7:Second});
#GetLocalYearFromSecond
snippet GetLocalYearFromSecond
	GetLocalYearFromSecond(\${1:nDateTime});
#GetLocalMonthFromSecond
snippet GetLocalMonthFromSecond
	GetLocalMonthFromSecond(\${1:nDateTime});
#GetLocalDayFromSecond
snippet GetLocalDayFromSecond
	GetLocalDayFromSecond(\${1:nDateTime});
#GetLocalHourFromSecond
snippet GetLocalHourFromSecond
	GetLocalHourFromSecond(\${1:nDateTime});
#GetLocalMinuteFromSecond
snippet GetLocalMinuteFromSecond
	GetLocalMinuteFromSecond(\${1:nDateTime});
#GetLocalSecondFromSecond
snippet GetLocalSecondFromSecond
	GetLocalSecondFromSecond(\${1:nDateTime});
#GetSystemtimeDateString
snippet GetSystemtimeDateString
	GetSystemtimeDateString();
#GetSystemtimeTimeString
snippet GetSystemtimeTimeString
	GetSystemtimeTimeString(\${1:bMsec});
#GetSystimeYear
snippet GetSystimeYear
	GetSystimeYear();
#GetSystimeMonth
snippet GetSystimeMonth
	GetSystimeMonth();
#GetSystimeDay
snippet GetSystimeDay
	GetSystimeDay();
#GetSystimeHour
snippet GetSystimeHour
	GetSystimeHour();
#GetSystimeMinute
snippet GetSystimeMinute
	GetSystimeMinute();
#GetSystimeSecond
snippet GetSystimeSecond
	GetSystimeSecond();
#GetSystimeMSec
snippet GetSystimeMSec
	GetSystimeMSec();
#GetSystimeWeek
snippet GetSystimeWeek
	GetSystimeWeek();
#GetUTCDateTimeFromSecond
snippet GetUTCDateTimeFromSecond
	GetUTCDateTimeFromSecond(\${1:nDateTime}, \${2:Year}, \${3:Month}, \${4:Hour}, \${5:Minute}, \${6:Second});
#GetUTCYearFromSecond
snippet GetUTCYearFromSecond
	GetUTCYearFromSecond(\${1:nDateTime});
#GetUTCMonthFromSecond
snippet GetUTCMonthFromSecond
	GetUTCMonthFromSecond(\${1:nDateTime});
#GetUTCDayFromSecond
snippet GetUTCDayFromSecond
	GetUTCDayFromSecond(\${1:nDateTime});
#GetUTCHourFromSecond
snippet GetUTCHourFromSecond
	GetUTCHourFromSecond(\${1:nDateTime});
#GetUTCMinuteFromSecond
snippet GetUTCMinuteFromSecond
	GetUTCMinuteFromSecond(\${1:nDateTime});
#GetUTCSecondFromSecond
snippet GetUTCSecondFromSecond
	GetUTCSecondFromSecond(\${1:nDateTime});
#TimeSynchNetNode
snippet TimeSynchNetNode
	TimeSynchNetNode(\${1:strNetNodeIP});
#TransDateTimeByTimeZone
snippet TransDateTimeByTimeZone
	TransDateTimeByTimeZone(\${1:strDateTime}, \${2:strTimeZone1}, \${3:strTimeZone2});
#GetDateTime
snippet GetDateTime
	GetDateTime();
#DateAdd
snippet DateAdd
	DateAdd(\${1:strInterval}, \${2:nNumber}, \${3:strDate});
#DateDiff
snippet DateDiff 
	DateDiff(\${1:strInterval}, \${2:nNumber}, \${3:strDate});
#DatePart
snippet DatePart
	DatePart(\${1:strInterval}, \${2:strDate});
#SetLoaclSystemTime
snippet SetLoaclSystemTime
	SetLoaclSystemTime(\${1:nYear}, \${2:nMonth}, \${3:nDay}, \${4:nHour}, \${5:nMinute}, \${6:nSecond});


#Abs
snippet Abs
	Abs(\${1:dbNumber});
#ArcCos
snippet ArcCos
	ArcCos(\${1:dbNumber});
#ArcSin
snippet ArcSin
	ArcSin(\${1:dbNumber});
#ArcTan
snippet ArcTan
	ArcTan(\${1:dbNumber});
#Average
snippet Average
	Average(\${1:Param1}, \${2:Param2});
#Cos
snippet Cos
	Cos(\${1:dbNumber});
#Exp
snippet Exp
	Exp(\${1:dbNumber});
#Int
snippet Int
	Int(\${1:dbNumber});
#LogE
snippet LogE
	LogE(\${1:dbNumber});
#LogN
snippet LogN
	LogN(\${1:dbNumber}, \${2:nBase});
#Max
snippet Max
	Max(\${1:param1}, \${2:param2});
#Min
snippet Min
	Min(\${1:param1}, \${2:param2});
#PI
snippet PI
	PI();
#Pow
snippet Pow
	Pow(\${1:dbX}, \${2:dbY});
#Sgn
snippet Sgn
	Sgn(\${1:dbNumber});
#Sin
snippet Sin
	Sin(\${1:dbNumber});
#Sqrt
snippet Sqrt
	Sqrt(\${1:dbNumber});
#Sum
snippet Sum
	Sum(\${1:dbParam1}, \${2:dbParam2});
#Tan
snippet Tan
	Tan(\${1:dbNumber});
#Trunc
snippet Trunc
	Trunc(\${1:dbNumber});
#RandInt
snippet RandInt
	RandInt(\${1:StartNumber}, \${2:EndNumber});
#RandDouble
snippet RandDouble
	RandDouble(\${1:StartNumber}, \${2:EndNumber}, \${3:Precision});


#ActivateApp
snippet ActivateApp
	ActivateApp(\${1:strWindowsTitleName});
#displayMCI
snippet displayMCI
	displayMCI(\${1:strCmdString}, \${2:strOption});
#Exit
snippet Exit
	Exit(\${1:nOption});
#InfoAppActive
snippet InfoAppActive
	InfoAppActive(\${1:strProgramName});
#InfoAppDir
snippet InfoAppDir
	InfoAppDir();
#InfoAppTitle
snippet InfoAppTitle
	InfoAppTitle(\${1:strProgramName});
#InfoDisk
snippet InfoDisk
	InfoDisk(\${1:strDriverName}, \${2:nInfoType});
#InfoFile
snippet InfoFile
	InfoFile(\${1:strFileName}, \${2:nInfoType});
#InfoResource
snippet InfoResource
	InfoResource(\${1:nResourceType});
#PlaySound
snippet PlaySound
	PlaySound(\${1:strWaveFileName}, \${2:nMode});
#SendKeys
snippet SendKeys
	SendKeys(\${1:strCmd});
#StartApp
snippet StartApp
	StartApp(\${1:strProgramName});
#StopApp
snippet StopApp
	StopApp(\${1:strProgramName}, \${2:nType});
#Trace
snippet Trace
	Trace(\${1:strProgramName}, \${2:nType});
#ClearArray
snippet ClearArray
	ClearArray(\${1:strArrayName});
#CreatArray
snippet CreatArray
	CreatArray(\${1:strArrayName}, \${2:nElementType}, \${3:nElementNum});
#GetArrayElement
snippet GetArrayElement
	GetArrayElement(\${1:strArrayName}, \${2:nIndex});
#GetArrayElementType
snippet GetArrayElementType
	GetArrayElementType(\${1:strArrayName});
#GetArrayLength
snippet GetArrayLength
	GetArrayLength(\${1:strArrayName});
#GetArrayLength
snippet GetArrayLength
	GetArrayLength(\${1:strArrayName});
#SetArrayElement
snippet SetArrayElement
	SetArrayElement(\${1:strArrayName}, \${2:nIndex}, \${3:strElementValue});
#ShowMessageBox
snippet ShowMessageBox
	ShowMessageBox(\${1:lpszText}, \${2:lpszCaption}, \${3:nType}, \${4:nIcon});
#AsynShowMessageBox
snippet AsynShowMessageBox
	AsynShowMessageBox(\${1:lpszText}, \${2:lpszCaption}, \${3:nIcon});
#GetCursorPosX
snippet GetCursorPosX
	GetCursorPosX();
#GetCursorPosY
snippet GetCursorPosY
	GetCursorPosY();
#GetCurrPageFocusGraphyName
snippet GetCurrPageFocusGraphyName
	GetCurrPageFocusGraphyName();
#Ping
snippet Ping
	Ping(\${1:strIP}, \${2:nRetryTimes});
#Is64BitWindows
snippet Is64BitWindows
	Is64BitWindows();
#RegODBCDataSource
snippet RegODBCDataSource
	RegODBCDataSource(\${1:b32Bit}, \${2:strDSNName}, \${3:strComment}, \${4:strIP}, \${5:nPort}, \${6:strUser}, \${7:strPassword}, \${8:strDB}, \${9:strDriverName});
#GetComputerName
snippet GetComputerName
	GetComputerName();
#GetWindowsUserName
snippet GetWindowsUserName
	GetWindowsUserName();
#GetProjectClientName
snippet GetProjectClientName
	GetProjectClientName(\${1:strProjectName});
#GetProjectClientUnit
snippet GetProjectClientUnit
	GetProjectClientUnit(\${1:strProjectName});


#CreateCsvFile1
snippet CreateCsvFile1
	CreateCsvFile1(\${1:strCsvFilePath}, \${2:strFoldPath}, \${3:strFileExtension});
#FileCopy
snippet FileCopy
	FileCopy(\${1:strSrcFile}, \${2:strDstFile});
#FileDelete
snippet FileDelete
	FileDelete(\${1:strFileName});
#FileMove
snippet FileMove
	FileMove(\${1:strSrcFile}, \${2:strDstFile});
#FileReadFields
snippet FileReadFields
	FileReadFields(\${1:strFileName}, \${2:nFileOffset}, \${3:strStartTagName}, \${4:nNumberOfFields});
#FileReadStr
snippet FileReadStr
	FileReadStr(\${1:strFileName}, \${2:nFileOffset}, \${3:strTag}, \${4:nCharsToRead});
#FileWriteFields
snippet FileWriteFields
	FileWriteFields(\${1:strFileName}, \${2:nFileOffset}, \${3:strStartTagName}, \${4:nNumberOfFields});
#FileWriteStr
snippet FileWriteStr
	FileWriteStr(\${1:strFileName}, \${2:nFileOffset}, \${3:Str}, \${4:nLineFeed});
#ReadStringFromFile
snippet ReadStringFromFile
	ReadStringFromFile (\${1:strFileName}, \${2:nFileOffset}, \${3:nCharsToRead});
#ShowFileDialog
snippet ShowFileDialog
	ShowFileDialog(\${1:strDefaultPath}, \${2:strExtendTypes});
#ShowFolderDialog
snippet ShowFolderDialog
	ShowFolderDialog();


#CreateCsvFile2
snippet CreateCsvFile2
	CreateCsvFile2(\${1:strCsvFilePath}, \${2:iFilter});
#DText
snippet DText
	DText(\${1:Value}, \${2:strOnMsg}, \${3:strOffMsg});
#VarRefAddress
snippet VarRefAddress
	VarRefAddress(\${1:RefTagName}, \${2:RefedTagName});
#VarRefAddressRelease
snippet VarRefAddressRelease
	VarRefAddressRelease(\${1:RefTagName});
#CreateExcelFile
snippet CreateExcelFile
	CreateExcelFile(\${1:strExcelFilePath}, \${2:strTemplateFilePath}, \${3:strTemplateFileInitFunc});
#ShowColourDialog
snippet ShowColourDialog
	ShowColourDialog();
#ThreeDESFileEncrypt
snippet ThreeDESFileEncrypt
	ThreeDESFileEncrypt(\${1:key1}, \${2:key2}, \${3:srcfilepath}, \${4:desfilepath});
#ThreeDESFileDecrypt
snippet ThreeDESFileDecrypt
	ThreeDESFileDecrypt(\${1:key1}, \${2:key2}, \${3:srcfilepath}, \${4:desfilepath});
#Bit
snippet Bit
	Bit(\${1:tagName}, \${2:bitNo});
#BitSet
snippet BitSet
	BitSet(\${1:tagName}, \${2:bitNo}, \${3:bitvalue});
#GetLocalIP
snippet GetLocalIP
	GetLocalIP();
#WindowSize
snippet WindowSize
	WindowSize(\${1:nFlag});
#SubscribeTagFunc
snippet SubscribeTagFunc
	SubscribeTagFunc(\${1:TagNamesArrayName});
#UnSubscribeTagFunc
snippet UnSubscribeTagFunc
	UnSubscribeTagFunc(\${1:TagNamesArrayName});
#GetRGBValue
snippet GetRGBValue
	GetRGBValue(\${1:Red}, \${2:Green}, \${3:Blue});
#ShowPicture
snippet ShowPicture
	ShowPicture(\${1:strPicName});
#ClosePicture
snippet ClosePicture
	ClosePicture(\${1:strPicName});
#GetTagField
snippet GetTagField
	GetTagField(\${1:TagName}, \${2:FieldName});
#GetTagField
snippet GetTagField
	GetTagField(\${1:TagName}, \${2:FieldName});
#SetTagField
snippet SetTagField
	SetTagField(\${1:TagName}, \${2:FieldName},  \${3:Value},  \${4:Function callback});
#StrToInt
snippet StrToInt
	StrToInt(\${1:strText});
#AckByTagName
snippet AckByTagName
	AckByTagName(\${1:tagName});
#AckByGroupName
snippet AckByGroupName
	AckByGroupName(\${1:groupName});
#VarRefAddress
snippet VarRefAddress
	VarRefAddress(\${1:RefTagName}, \${2:RefedTagName});
#ShowMessageBox
snippet ShowMessageBox
	ShowMessageBox(\${1:lpszText}, \${2:lpszCaption}, \${3:nType}, \${4:nIcon});
#Trace
snippet Trace
	Trace(\${1:strFormatString});
#StrToReal
snippet StrToReal
	StrToReal(\${1:strText});
#GetDateTime
snippet GetDateTime
	GetDateTime();
#StrFromInt
snippet StrFromInt
	StrFromInt(\${1:nInteger},\${2:nbase});
#GetSystimeWeek
snippet GetSystimeWeek
	GetSystimeWeek();
#GetUserInfoContent
snippet GetUserInfoContent
	GetUserInfoContent(\${1:strUserName},\${2:iUserInfoID});
#StrRight
snippet StrRight
	StrRight(\${1:strText},\${2:nCount});
#KDBGetDataset1
snippet KDBGetDataset1
	KDBGetDataset1(\${1:DatasetName},\${2:strConnectIDName}, \${3:SqlStr});
#KDBDisConnect
snippet KDBDisConnect
	KDBDisConnect(\${1:strConnectIDName});
#KDBGetDatasetRows
snippet KDBGetDatasetRows
	KDBGetDatasetRows(\${1:DatasetName});
#KDBGetCellValueByFieldId
snippet KDBGetCellValueByFieldId
	KDBGetCellValueByFieldId(\${1:DatasetName},\${2:RowID}, \${3:FieldId});
#GetCursorPosX
snippet GetCursorPosX
	GetCursorPosX();
#GetCursorPosY
snippet GetCursorPosY
	GetCursorPosY();
#SetLayerVisibleByName
snippet SetLayerVisibleByName
	SetLayerVisibleByName(\${1:strPageName},\${2:szLayerName}, \${3:bEnable});
#SetLayerVisibleByIndex
snippet SetLayerVisibleByIndex
	SetLayerVisibleByIndex(\${1:strPageName},\${2:StartIndex}, \${3:EndIndex}, \${4:bEnable});
#KDBGetConnectID
snippet KDBGetConnectID
	KDBGetConnectID(\${1:strConnectIDName},\${2:ConnectStr});
#KDBGetConnectID
snippet KDBGetConnectID
	KDBGetConnectID(\${1:strConnectIDName},\${2:ConnectStr});
#LogOn
snippet LogOn
	LogOn();
#LogOn
snippet LogOn
	LogOn();
#LogOff
snippet LogOff
	LogOff();
#ChangePassword
snippet ChangePassword
	ChangePassword();
#Exit
snippet Exit
	Exit();
#GetCurrentUser
snippet GetCurrentUser
	GetCurrentUser();
#FistPage
snippet FistPage
	FistPage();
#PreviousPage
snippet PreviousPage
	PreviousPage();
#NextPage
snippet NextPage
	NextPage();
#LastPage
snippet LastPage
	LastPage();
#SetFilter
snippet SetFilter
	SetFilter();
#SetFilterString
snippet SetFilterString
	SetFilterString(\${1:filterMsg});
#AlarmSaveAs
snippet AlarmSaveAs
	AlarmSaveAs(\${1:StrFileName});
#SetFieldWidth
snippet SetFieldWidth
	SetFieldWidth(\${1:FieldID},\${2:PixelWidth});
#SetColumWidth
snippet SetColumWidth
	SetColumWidth(\${1:FieldID},\${2:PixelWidth});
#Print
snippet Print
  Print();
#Preview
snippet Preview
	Preview();
#SetText
snippet SetText
	SetText(\${1:text});
#GetText
snippet GetText
	GetText();
#ClearText
snippet ClearText
	ClearText();
#GetCurrentValue
snippet GetCurrentValue
	GetCurrentValue();
#GetTodayValue
snippet GetTodayValue
	GetTodayValue();
#GetCurrentWeekDay
snippet GetCurrentWeekDay
	GetCurrentWeekDay();
#GetTodayWeekDay
snippet GetTodayWeekDay
	GetTodayWeekDay();
#SetCurrentValue
snippet SetCurrentValue
	SetCurrentValue(\${1:currentValue});
#SetValue
snippet SetValue
	SetValue(\${1:value});
#GetValue
snippet GetValue
	GetValue();
#GetHours
snippet GetHours
	GetHours();
#GetMinutes
snippet GetMinutes
	GetMinutes();
#GetSeconds
snippet GetSeconds
	GetSeconds();
#GetCurrentText
snippet GetCurrentText
	GetCurrentText();
#GetItemCount
snippet GetItemCount
	GetItemCount();
#AddItem
snippet AddItem
	AddItem(\${1:addItem});
#InsertItem
snippet InsertItem
	InsertItem(\${1:index},\${2:insertItem});
#DeleteItem
snippet DeleteItem
	DeleteItem(\${1:index});
#ClearAll
snippet ClearAll
	ClearAll();
#GetFirstIndex
snippet GetFirstIndex
	GetFirstIndex(\${1:strText},\${2:nStartItem});
#GetItemText
snippet GetItemText
	GetItemText(\${1:itemIndex});
#GetItemData
snippet GetItemData
	GetItemData(\${1:itemIndex});
#SetItemData
snippet SetItemData
	SetItemData(\${1:ItemIndex},\${2:ItemData});
#Menu
snippet Menu
	Menu();
#GetButtonText
snippet GetButtonText
	GetButtonText(\${1:nIndex});
#GetButtonIndex
snippet GetButtonIndex
	GetButtonIndex(\${1:radioName});
#SetButtonEnable
snippet SetButtonEnable
	SetButtonEnable(\${1:nIndex},\${2:enable});
#GetButtonEnable
snippet GetButtonEnable
	GetButtonEnable(\${1:nIndex});
#SetButtonVisible
snippet SetButtonVisible
	SetButtonVisible(\${1:nIndex},\${2:visible});
#GetButtonVisible
snippet GetButtonVisible
	GetButtonVisible(\${1:nIndex});
#SetButtonText
snippet SetButtonText
	SetButtonText(\${1:nIndex},\${2:strName});
#GetCheckState
snippet GetCheckState
	GetCheckState();
#SetCheckState
snippet SetCheckState
	SetCheckState(\${1:check});
#GetSelectedNodeName
snippet GetSelectedNodeName
	GetSelectedNodeName();
#GetSelectedNodeText
snippet GetSelectedNodeText
	GetSelectedNodeText();
#GetNodeName
snippet GetNodeName
	GetNodeName(\${1:strNodeText});
#GetNodeText
snippet GetNodeText
	GetNodeText(\${1:strNodeName});
#GetNodeParent
snippet GetNodeParent
	GetNodeParent(\${1:strNodeName});
#SetNodeText
snippet SetNodeText
	SetNodeText(\${1:strNodeText},\${2:strNodeName});
#AddNewNode
snippet AddNewNode
	AddNewNode(\${1:strParentNodeName},\${2:strNodeName},\${3:strNodeText});
#DeleteNode
snippet DeleteNode
	DeleteNode(\${1:strNodeName},\${2:bDeleteChild});
#InsertNewNode
snippet InsertNewNode
	InsertNewNode(\${1:strPreviousNodeName},\${2:strNodeName},\${3:strNodeText});
#ClearAllNodes
snippet ClearAllNodes
	ClearAllNodes();
#GetNodeCheckStatus
snippet GetNodeCheckStatus
	GetNodeCheckStatus(\${1:strNodeName});
#SetNodeSelected
snippet SetNodeSelected
	SetNodeSelected(\${1:strNodeName});
#GetTreeNodeData
snippet GetTreeNodeData
	GetTreeNodeData(\${1:strNodeName});
#SetTreeNodeData
snippet SetTreeNodeData
	SetTreeNodeData(\${1:strNodeName},\${2:nNodeData});
#SetNodeCheckState
snippet SetNodeCheckState
	SetNodeCheckState(\${1:strNodeName},\${2:bChecked});
#ExpandNode
snippet ExpandNode
	ExpandNode(\${1:lpStrNodeName},\${2:nCode});
#GetChildNodeName
snippet GetChildNodeName
	GetChildNodeName(\${1:lpStrNodeName});
#GetNextSiblingNodeName
snippet GetNextSiblingNodeName
	GetNextSiblingNodeName(\${1:lpStrNodeName});
#GetPrevSiblingNodeName
snippet GetPrevSiblingNodeName
	GetPrevSiblingNodeName(\${1:lpStrNodeName});
#GetData
snippet GetData
	GetData();
#AppendRow
snippet AppendRow
	AppendRow(\${1:rowData});
#DeleteRow
snippet DeleteRow
	DeleteRow(\${1:rownumber});
#GetTitle
snippet GetTitle
	GetTitle();
#SetTitle
snippet SetTitle
	SetTitle(\${1:title});
#Collapse
snippet Collapse
	Collapse();
#Minimize
snippet Minimize
	Minimize();
#Maximize
snippet Maximize
	Maximize();
#Closed
snippet Closed
	Closed();
#Restore
snippet Restore
	Restore();
#SetHtml
snippet SetHtml
	SetHtml(\${1:html});
#GetName
snippet GetName
	GetName();
#GetName
snippet GetName
	GetName();
#Files
snippet Files
	Files();
#GetColumnFields
snippet GetColumnFields
	GetColumnFields();
#GetColumnOption
snippet GetColumnOption
	GetColumnOption(\${1:field});
#AppendRow
snippet AppendRow
	AppendRow(\${1:rowDate});
#ExpandGroup
snippet ExpandGroup
	ExpandGroup(\${1:index});
#LoadData
snippet LoadData
	LoadData(\${1:rowData});
#GetData
snippet GetData
	GetData();
#GetRoot
snippet GetRoot
	GetRoot();
#GetRoots
snippet GetRoots
	GetRoots();
#GetParent
snippet GetParent
	GetParent(\${1:index});
#GetChildren
snippet GetChildren
	GetChildren(\${1:index});
#Find
snippet Find
	Find(\${1:index});
#Collapse
snippet Collapse
	Collapse(\${1:index});
#CollapseGroup
snippet CollapseGroup
	CollapseGroup(\${1:index});
#CollapseAll
snippet CollapseAll
	CollapseAll();
#Expand
snippet Expand
	Expand();
#ExpandAll
snippet ExpandAll
	ExpandAll();
#Append
snippet Append
	Append(\${1:rowData});
#Insert
snippet Insert
	Insert(\${1:index},\${2:rowData});
#Remove
snippet Remove
	Remove(\${1:index});
`,e.scope="javascript"});

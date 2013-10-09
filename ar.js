navigator.getMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia);

function AugmentedReality(_video, _itemList) {  //, newListCallback, distance4NewImages 
    "use strict";
    var lastKnownPosition = null;			//Device position
    var lastKnownDeviceDirection = null;  	//Bearing of the device
    var watchPosId;
    
    
    //Configuration
    var AREASIZE = 10000; 					//Collect imagedata from an area of this size 10000
    var DISTANCE_TO_VISIBLE_IMAGE = 200;  	//Meters to an image when it should be visible
    var IN_FOCUS_ANGLE = 15; 				//Degrees. The angle that desides if an image should be in focus
    var UPDATE_ANGLE = 1;					//Degrees. The amount of degrees that the device bearing must change in order for the view to update
    var ITEMS_FIXED = true;					//If true, the item icon will not be moving around as long as it is in focus.
    var TRACE_VIEW = true;					//When true, extra information is printed in the view

    //Constants
    var NON_APPROVED_POSITION = 0;
    var HORIZONTAL_POSITION = 1;
    var VERTICAL_POSITION = 2;

    var nearbyItems = null;  			//Temporary list that holds within the range of DISTANCE_TO_VISIBLE_IMAGE

    var mediaContext = null;
    var mediaCanvas;

    var itemInfoArray = [];				//Contains ItemInfo objects of all images within the area AREASIZE
    for(var i = 0; i < _itemList.length ; i++){
        //console.log("Creating item " + _itemList[0].id);
		itemInfoArray[i] = new ItemInfo(_itemList[i].id, _itemList[i].latitude, _itemList[i].longitude);
		var markerObj = new Image();
		markerObj.src = _itemList[i].iconPath;
		itemInfoArray[i].icon = markerObj;
	}
	var video = _video;

	var itemCallback = null;		//Function that is called when an item is clicked
	
	var markerObjSmall = null;
	
	function NearbyItem(){
		this.index = null;			//index that point to a position in itemInfoArray
		this.lastXPos = null;
		this.lastYPos = null;
		this.lastKnownAngle = null; //Bearing, the angle between north and the element as seen from the device 
		this.inFocus = false;		//true if the item is in focus, that is visible in teh view
	}
	
	
	function ItemInfo(_id, _lat, _lng) {
		this.id = _id;
		this.latitude = _lat;
		this.longitude = _lng;
		this.icon = null;
	};
	
	this.pause = function(stop){
        if(stop) {
            window.removeEventListener('deviceorientation', devOrientationHandler, false);
            navigator.geolocation.clearWatch(watchPosId);
        }else{
            window.addEventListener('deviceorientation', devOrientationHandler, false);
            watchPosId = navigator.geolocation.watchPosition(updateLocation, handleLocationError, {enableHighAccuracy: true});
        }
	};


	this.initPage = function() {
		
		markerObjSmall = new Image();
		markerObjSmall.src = "assets/image/marker_white20x20.png";
		
		if(navigator.geolocation){
			console.log("geolocation support!");
			watchPosId = navigator.geolocation.watchPosition(updateLocation, handleLocationError, {enableHighAccuracy: true});
			//navigator.geolocation.watchPosition(updateLocation, handleLocationError, {enableHighAccuracy: true,frequency: 3000 });
		}else{
			alert("No support for geolocation");
		}

		$("#cameraView").append("<canvas id='cameraCanvas' style='border: 1px solid;'></canvas>");
		mediaCanvas = document.getElementById("cameraCanvas");	
		mediaCanvas.addEventListener('click', canvasClicked);
		mediaContext = mediaCanvas.getContext('2d');

		if(navigator.getMedia){
			console.log("Got support for getUserMedia");
			//var constraint = {video: {optional: {faceingMode: "face"}}};
			navigator.getMedia({video: true}, gotLocalStream, mediaErrorCallback);
		}else{
			alert("No support for getUserMedia");
		}

		if(window.DeviceOrientationEvent) {
			//console.log("DeviceOrientation is supported");
			window.addEventListener('deviceorientation', devOrientationHandler, false);
			window.addEventListener("compassneedscalibration", function(event) {
				alert("Compass needs calibration");
			}, true);
		}else{
			alert("No support for device orientation");
		}
	
		function mediaErrorCallback(error) {
			console.log('An error occurred when accessing camera: Error code: ' + error.code);
			return;
		}
	
		function handleLocationError(error) {
			switch(error.code){
			case 0:
				alert("There was an error while retrieving your location: " + error.message);
				break;
			case 1:
				alert("The user prevented this page from retrieving a location.");
				break;
			case 2:
				alert("The browser was unable to determine your location: " + error.message);
				window.location = "oldBrowser.html";
				break;
			case 3:
				alert("The browser timed out before retrieving the location.");
				break;
			}
		}
	};
	
	this.setItemCallback = function(_callback) {
		itemCallback = _callback;
	};

	function canvasClicked(event) {
		var xTmp = event.pageX;
		var yTmp = event.pageY;
		console.log("Clicked pos " + xTmp + ". Checking " + nearbyItems.length + " items");
		for(var i = 0 ; i < nearbyItems.length ; i++){
			if(nearbyItems[i].inFocus){
				if(Math.abs(nearbyItems[i].lastXPos - event.pageX) < 60){  //60 = the size of the area that is pressed
					itemCallback(itemInfoArray[nearbyItems[i].index].id);
				}
			}
		}
	}


	
	//Calculates what images that should be visible
	//dir(ection) is the bearing of which the device is pointing
	//Updates the nearbyItems array
	function updateImagesInFocus(dir) {
		if(nearbyItems === null){
			return; //Not initiated yet
		}
		for(var i = 0 ; i < nearbyItems.length ; i++){
			var angle = null;
			var latLength = Math.abs(lastKnownPosition.coords.latitude - itemInfoArray[nearbyItems[i].index].latitude);
			var longLength = Math.abs(lastKnownPosition.coords.longitude - itemInfoArray[nearbyItems[i].index].longitude);
			switch(getQuadrant(itemInfoArray[nearbyItems[i].index])){
			case 1:
				angle = Math.tan(longLength/latLength);
				break;
			case 2:
				angle = Math.tan(latLength/longLength) + 90;
				break;
			case 3:
				angle = Math.tan(longLength/latLength) + 180;
				break;
			case 4:
				angle = Math.tan(latLength/longLength) + 270;
				break;
			}
			//console.log("Image " + itemInfoArray[nearbyImages[i]].id + "(lat: " + itemInfoArray[nearbyImages[i]].latitude + ", long: " + itemInfoArray[nearbyImages[i]].longitude + ") has angle " + angle + " degrees. and direction of device is " + dir);
			if(Math.abs(angle - dir) < IN_FOCUS_ANGLE){  //TODO: bug, handle high and low angles 
				//Adding the image since it is "in focus"
				nearbyItems[i].lastKnownAngle = angle;
				nearbyItems[i].inFocus = true;
			}else{
				nearbyItems[i].inFocus = false;
			}
		}
	
		//Returns a number that specify what quadrant the image is located in, in relation to the device position
		function getQuadrant(imageInfo) {
			if(imageInfo.latitude > lastKnownPosition.coords.latitude && imageInfo.longitude > lastKnownPosition.coords.longitude){
				return 1;
			}else if(imageInfo.latitude < lastKnownPosition.coords.latitude && imageInfo.longitude > lastKnownPosition.coords.longitude){
				return 2;
			}else if(imageInfo.latitude < lastKnownPosition.coords.latitude && imageInfo.longitude < lastKnownPosition.coords.longitude){
				return 3;
			}else if(imageInfo.latitude > lastKnownPosition.coords.latitude && imageInfo.longitude < lastKnownPosition.coords.longitude){
				return 4;
			}else{
				console.err("Something is very wrong in getQuadrant!");
			}
		}
	}

	//Constantly called with new alpha/beta/gamma values
	function devOrientationHandler(event) {
		if(nearbyItems === null) {
			return; //AugmentedReality not initiated yet
		}
		var deviceDirection;
		var orientation = checkOrientation(event);
		//Get a direction rather than the alpha value
		switch(orientation) {
		case VERTICAL_POSITION:
			deviceDirection = event.alpha;
			break;
		case HORIZONTAL_POSITION:
			deviceDirection = event.alpha + 90;
			if(deviceDirection > 360) {
				deviceDirection = deviceDirection - 360;
			}
			break;
		case NON_APPROVED_POSITION:
			//TODO: Symbol or something else?
			deviceDirection = event.alpha;  //Todo: But it is not correct, but we'll use it for now. Maybe better with null...		
			//console.log("Please have the device in either an vertical or horizontal position");
		}
		
        if(lastKnownDeviceDirection === null) {
			lastKnownDeviceDirection = deviceDirection;
		}else{
			var lastKnownDirectionNew;
			var newDirection;
			//Calculate a temporary newDirection to be able to see if we are above the hysteresis value UPDATE_ANGLE
			if(lastKnownDeviceDirection < 5 && deviceDirection > 355) {
				lastKnownDirectionNew = lastKnownDeviceDirection + 360;
			}else if(lastKnownDeviceDirection > 355 && deviceDirection < 5) {
				newDirection = deviceDirection + 360;
			}else{
				lastKnownDirectionNew = lastKnownDeviceDirection;
				newDirection = deviceDirection;
			}
			//Allow some hysteresis save on the calculations a bit...
			if(Math.abs(newDirection - lastKnownDirectionNew) > UPDATE_ANGLE ) { //2 = Do not calculate or update canvas unles larger than 2 degrees movement...
				//console.log("------angle movement-------");
				//console.log("Device angle: " + deviceDirection);
				lastKnownDeviceDirection = deviceDirection;
				updateImagesInFocus(deviceDirection);
                /*
				console.log("Images in focus: ");
				for(var i = 0; i < nearbyItems.length ; i++){
					if(nearbyItems[i].inFocus){
						console.log("Id " + itemInfoArray[nearbyItems[i].index].id + ", angle: " + nearbyItems[i].lastKnownAngle);
					}
				}
                */
				//$("#nearbyImages").text("There are " + nearbyImages + " images within " + DISTANCE_TO_VISIBLE_IMAGE + " meters . " + imagesInFocus.length + " of them are straight ahead");
				updateView();
			}
		}		
		//$("#alpha").text(Math.round(event.alpha) + ", direction: " + deviceDirection);
		//$("#beta").text(Math.round(event.beta));
		//$("#gamma").text(Math.round(event.gamma));
	}

	//paints item on canvas
	function updateView(){
	
		var videoWidth = video.clientWidth; 
		var videoHeight = video.clientHeight; 
		mediaCanvas.width = videoWidth;
		mediaCanvas.height = videoHeight;
		
		mediaContext.font = "25px Arial";
		mediaContext.clearRect(0, 0, mediaContext.canvas.width, mediaContext.canvas.height);
		for(var i = 0; i < nearbyItems.length; i++){
			if(nearbyItems[i].inFocus){
				var x, y;
				if(ITEMS_FIXED){
					x = (videoWidth/2)+(i*7)-40;  //todo: 40 should be based on the size of the icon
					y = (videoHeight/3)+(i*10);
				}else{
					//Calculate the angle between the leftmost part of view and the bearing to item
					var imageAngle = nearbyItems[i].lastKnownAngle - lastKnownDeviceDirection + IN_FOCUS_ANGLE;
					x = videoWidth * imageAngle / (IN_FOCUS_ANGLE*2);
					y = videoHeight/3;
				}			
				mediaContext.drawImage(itemInfoArray[nearbyItems[i].index].icon, x-12, y-25);
				mediaContext.fillText(itemInfoArray[nearbyItems[i].index].id, x, y);
				nearbyItems[i].lastXPos = x;
				nearbyItems[i].lastYPos = y;
			}
		}
		if(TRACE_VIEW){
			mediaContext.font = "20px Arial";
			mediaContext.fillStyle = "black";
			mediaContext.fillText(Math.floor(lastKnownDeviceDirection) + "\u00b0", 20, 30);  //"\u00b0" = degree symbol
			mediaContext.drawImage(markerObjSmall, 20, 40);
			mediaContext.fillText(nearbyItems.length + " ", 45, 55);
			if(lastKnownPosition.coords.accuracy > 500){
				mediaContext.fillStyle = "red";
				mediaContext.fillText(lastKnownPosition.coords.accuracy, 120, 30);
				mediaContext.fillStyle = "black";
			}else{
				mediaContext.fillText(lastKnownPosition.coords.accuracy, 120, 30);
			}
		}
		mediaContext.stroke();
	}

	function checkOrientation(event){
		var orientation = NON_APPROVED_POSITION;
		if((event.beta > -100) && (event.beta < -80) && (event.gamma < 10) && (event.gamma > -10)){
			orientation = VERTICAL_POSITION;
		} else if(event.beta > -10 && event.beta < 10 && event.gamma < 100 && event.gamma > 80){
			orientation = HORIZONTAL_POSITION;
		}else{
			//console.log("Please have the device in either an vertical or horizontal position");
		}
		return orientation;
	}


	//Constantly called as new positions are given
	function updateLocation(position){

		if(nearbyItems === null){
			updateNearbyItems(position, DISTANCE_TO_VISIBLE_IMAGE);
		}
		console.log("Got new Position");
		if(lastKnownPosition === null){
			//console.log("Setting lastKnownPosition");
			lastKnownPosition = position;
		}else{
			var distanceSinceLastSearch = distanceBetween(position.coords.latitude, position.coords.longitude, lastKnownPosition.coords.latitude, lastKnownPosition.coords.longitude);
			//console.log(distanceSinceLastSearch);
			if(distanceSinceLastSearch > 5){ //Only loop the list if we have moved 5 meters
				//console.log("distanceSinceLastSearch: " + distanceSinceLastSearch);
				lastKnownPosition = position;
				updateNearbyItems(position, DISTANCE_TO_VISIBLE_IMAGE);
			}
		}
		//$("#longitude").text(position.coords.longitude);
		//$("#latitude").text(position.coords.latitude);
		//$("#accuracy").text(position.coords.accuracy);
	}

	function updateNearbyItems(pos, distance){
		nearbyItems = [];
		for(var i = 0; i < itemInfoArray.length ; i++){		
			if(distanceBetween(itemInfoArray[i].latitude, itemInfoArray[i].longitude, pos.coords.latitude, pos.coords.longitude) <= distance){
				var tmpItem = new NearbyItem();
				tmpItem.index = i;
				nearbyItems.push(tmpItem);
			}
		}
	}

	function gotLocalStream(stream){
		var video = document.querySelector("video");
		video.src = window.URL.createObjectURL(stream);
	}

	//Handler for geolocation errors
	function handleLocationError(error) {
		switch(error.code){
		case 0:
			alert("There was an error while retrieving your location: " + error.message);
			break;
		case 1:
			alert("The user prevented this page from retrieving a location.");
			break;
		case 2:
			alert("The browser was unable to determine your location: " + error.message);
			window.location = "oldBrowser.html";
			break;
		case 3:
			alert("The browser timed out before retrieving the location.");
			break;
		}
	}

	function toRad(x){
		return (x * Math.PI / 180);
	}

	//Implements Haversine formula to measure distance between two points
	function distanceBetween(lat1, lng1, lat2, lng2){  
		var R = 6371000; // Earth radius in meters 

		var x1 = lat2-lat1;
		var dLat = toRad(x1);  
		var x2 = lng2-lng1;
		var dLng = toRad(x2);  
		var a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
                Math.sin(dLng/2) * Math.sin(dLng/2);  
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
		var d = R * c; 
		return d;
	}
}

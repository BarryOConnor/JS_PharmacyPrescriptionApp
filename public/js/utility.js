function logout(){
	auth.signOut();
	window.location.href = "../index.html";
}

/* ----------------------------------------
        Loader Code
---------------------------------------- */

// show the page loading animation
function showLoader(){
	document.body.classList.remove('hide-loader');
	document.body.classList.add('show-loader');
}

// hide the page loading animation
function hideLoader(){
	document.body.classList.remove('show-loader');
	document.body.classList.add('hide-loader');
}

/* ----------------------------------------
            Toast (popup notifications) Code
---------------------------------------- */
function poptoast(message, colorstyle){
	/*******************************************************************
	* This function is used to activate the popup messages
	*
	* input:
	* message: the text of the message body
	*******************************************************************/

	const toast = document.querySelector('#toast');
	toast.innerHTML = message;
	toast.classList.add(colorstyle);
	toast.classList.add("popup");
	setTimeout(function(){ 
		toast.classList.remove(colorstyle);
		toast.classList.remove("popup"); 
	}, 3000);  
}

/* ----------------------------------------
            Form Validation Code
---------------------------------------- */
function validateRequired(control){
    /*******************************************************************
    * This function validates a form control which is required
    *
    * input:
    * control: a reference to the control to validate
    *
    * returns: true or false depending on whether it is valid
    *******************************************************************/

	if(control.value.length == 0){
		control.parentElement.classList.remove("valid");
		control.parentElement.classList.add("invalid");
		document.getElementById(control.id + "-error").innerHTML = "<i class=\"fas fa-times-circle\"></i> This field cannot be blank";
		return false;
	} else {
		control.parentElement.classList.remove("invalid");
		control.parentElement.classList.add("valid");
		return true;
	};
}



function validateDate(control)
/*******************************************************************
* This function validates a form control which is a date and
* ensures it contains a valid date
*
* input:
* control: a reference to the control to validate
*
* returns: true or false depending on whether it is valid
*******************************************************************/
{
	var dateString = control.value;
	var isValid = true;
	// First check for the pattern
	if(!/^\d{4}\-\d{1,2}\-\d{1,2}$/.test(dateString)){ isValid = false; };

	// Parse the date parts to integers
	var parts = dateString.split("-");
	var day = parseInt(parts[2], 10);
	var month = parseInt(parts[1], 10);
	var year = parseInt(parts[0], 10);
	var monthLength = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
	var thisYear = new Date().getFullYear();
	// Check the ranges of month and year
	if(year < thisYear - 150 || year > thisYear || month == 0 || month > 12){
		control.parentElement.className = ' invalid';
		document.getElementById(control.id + "-error").innerHTML = "<i class=\"fas fa-times-circle\"> birth date must be between " + (thisYear - 150) + " and " + thisYear;
		return false;
	} else {
		// Adjust for leap years
		if(year % 400 == 0 || (year % 100 != 0 && year % 4 == 0)){ monthLength[1] = 29; }
		// Check the range of the day
		if(day <= 0 && day > monthLength[month - 1]){ isValid = false; };
	};

	if (isValid == false ) {
		control.parentElement.className = ' invalid';
		document.getElementById(control.id + "-error").innerHTML = "<i class=\"fas fa-times-circle\"></i> Please enter a valid date";
		return false;
	} else {
		control.parentElement.className = ' valid';
		return true;
	};
}




function validateEmail(control){
/*******************************************************************
* This function validates a form control which is an email and ensures it
* contains a valid email address
*
* input:
* control: a reference to the control to validate
*
* returns: true or false depending on whether it is valid
*******************************************************************/

	//regular expression for an email address
	var emailRegExp = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if(!emailRegExp.test(control.value)){
		control.parentElement.className = ' invalid';
		document.getElementById(control.id + "-error").innerHTML = "<i class=\"fas fa-times-circle\"></i> Email must be a valid email";
		return false;
	} else {
		control.parentElement.className = ' valid';
		return true;
	};
}
	

function validatePassword(control){
	/*******************************************************************
	* This function validates a form control which is an email and ensures it
	* contains a valid email address
	*
	* input:
	* control: a reference to the control to validate
	*
	* returns: true or false depending on whether it is valid
	*******************************************************************/

	//regular expression for an email address
	var passwordRegExp = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[a-z])(?=.*[@#$%^&+=!]).{8,}$/;

	if(!passwordRegExp.test(control.value)){
		control.parentElement.className = ' invalid';
		document.getElementById(control.id + "-error").innerHTML = "<i class=\"fas fa-times-circle\"></i> Must be 8 characters including uppercase, lowercase, numbers and one of: @#$%^&+=!";
		return false;
	} else {
		control.parentElement.className = ' valid';
		return true;
	};
}


function validateControl(currControl){
/*******************************************************************
* This function validates a form control and is used to update status when an update occurs
*
* input:
* control: a reference to the control to validate
*
* returns: true or false depending on whether it is valid
*******************************************************************/

	var validateString = "";
	var oneRadioChecked = false;
	var oneCheckChecked = false;
	if(currControl.getAttribute('data-validate') == 'true') {

		currControl.className=("");

		validateString = currControl.getAttribute('data-validation-type');
		if(validateString.search("required") != -1 && !validateRequired(currControl)) { return false; }
		if(validateString.search("file") != -1 && !validateFile(currControl)) { return false; }
		if(validateString.search("date") != -1 && !validateDate(currControl)) { return false; }
		if(validateString.search("email") != -1 && !validateEmail(currControl)) { return false; };
		if(validateString.search("password") != -1 && !validatePassword(currControl)) { return false; };
		if(validateString.search("optional") != -1 && !validateOptional(currControl)) { return false; };
		if(validateString.search("captcha") != -1  && !validateCaptcha(currControl)) { return false; };
		if(validateString.search("radio") != -1 && !oneRadioChecked) {
			if(!validateBoxes(currControl)) { 
				return false; 
			} else {
				oneRadioChecked = true;
			};
		};
		if(validateString.search("checkbox") != -1 && !oneCheckChecked) {
			if(!validateBoxes(currControl)) { 
				return false; 
			} else {
				oneCheckChecked = true;
			};
		};
		

	};
	return true;
}
	


function validateForm(currForm){
/*******************************************************************
* This function validates a form in it's entirity. Each control on the form
* is scanned for data- elements which indicate what type of validation
* each form element may require
*
* input:
* currForm: a reference to the form to validate
*
* returns: true or false depending on whether it is valid
*******************************************************************/
	var validates = true;

	for(var loopCount = 0; loopCount < currForm.elements.length; loopCount++) {
		if(!validateControl(currForm.elements[loopCount])) { validates = false; }
	}
	return validates;
}
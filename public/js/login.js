window.addEventListener('DOMContentLoaded', (event) => {
	hideLoader();
	const form = document.querySelector('#login-form');
	const email = document.querySelector("#email");
	const password = document.querySelector("#password");

	// process the email field on blur
	email.addEventListener('blur', (event) => {
		validateControl(email);
	})

	// process the email field on blur
	password.addEventListener('blur', (event) => {
		validateControl(password);
	})

	/*******************************************************************
	* Event listener for the login form submit - processes login
	*******************************************************************/
	form.addEventListener('submit', (event) => {
		showLoader();
		event.preventDefault();
		document.querySelector('#firebase-error').classList.add("hidden");
		if(validateForm(form)){
			// validate the login credentials
			auth.signInWithEmailAndPassword(email.value, password.value)
			.then((user) => {
				// login successful.
				auth.currentUser.getIdTokenResult()
				.then((idTokenResult) => {
					let redirString = idTokenResult.claims.role + "/";
					window.location.href = redirString.toLowerCase();
				})
				.catch((error) => {
					hideLoader();
					poptoast(error.message, "error");
				});
			}) 
			.catch((error) => {
				// Handle Errors here.
				hideLoader();
				document.querySelector('#firebase-error').classList.remove("hidden");
				document.querySelector('#firebase-error-message').innerHTML = error.message;
			});
		}
	});
});
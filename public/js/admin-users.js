const userName = document.querySelector("#name");
const userType = document.querySelector("#user-type");
const userEmail = document.querySelector("#email");
const displayName = document.querySelector("#display-name");
const userForm = document.querySelector("#user-form");

const numPerPage = 10;
var lastVisible = null;
var numRecords = 0;
var currentUID = null;
var currentType = null;
let maxUsers = 0;

var query = db.collection("users");

/*******************************************************************
* this function fires displays the content for a selected user in a popup
*******************************************************************/
function showUser(uid){
	const userUpdate = document.querySelector("#user-update");
	const userCreate = document.querySelector("#user-create");
	const modalTitle = document.querySelector("#modal-title");
	showLoader();

	if(uid == null){
		// new user, populate with blanks
		userUpdate.classList.add("hidden");
		userCreate.classList.remove("hidden");
		modalTitle.innerHTML = "Add a User";
		userName.value = "";
		userType.value = "Technician";
		userEmail.value = "";
		userName.parentElement.classList.remove("invalid");
		userName.parentElement.classList.remove("valid");
		userType.parentElement.classList.remove("invalid");
		userType.parentElement.classList.remove("valid");
		userEmail.parentElement.classList.remove("invalid");
		userEmail.parentElement.classList.remove("valid");
		MicroModal.show("user-modal")
	} else {
		// get the existing user and fill in their details
		currentUID = uid;
		userUpdate.classList.remove("hidden");
		userCreate.classList.add("hidden");
		modalTitle.innerHTML = "Update User";
		db.collection("users").doc(uid).get()
		.then(doc => {
			if (doc.exists) {
				const user = doc.data();
				userName.value = user.name;
				currentType = user.usertype;
				userType.value = user.usertype;
				userEmail.value = user.email;
				userName.parentElement.classList.remove("invalid");
				userName.parentElement.classList.remove("valid");
				userType.parentElement.classList.remove("invalid");
				userType.parentElement.classList.remove("valid");
				userEmail.parentElement.classList.remove("invalid");
				userEmail.parentElement.classList.remove("valid");
				MicroModal.show("user-modal")
			} else {
				poptoast("This User does not exist", error);
			};
		});
	};
	hideLoader();
}

/*******************************************************************
* this function deletes an exisiting user
*******************************************************************/
function deleteUser(uidvalue){
	showLoader();
	if (confirm("Are you sure you want to delete this user?")) {
		// initiate and use the backed function for deleting
		const deleteUser = functions.httpsCallable("deleteUser");
		deleteUser({uid: uidvalue})
		.then( result => {
			poptoast(result.data.message, "green");
		}).catch((error) => {
			poptoast(error.message, "error");
		});
	};
	hideLoader();
}

/*******************************************************************
* this function deletes an exisiting user
*******************************************************************/
function createNewUser(){
	showLoader();
	if(validateForm(userForm)){		

		// create a user object from the form
		var newUser = { name: userName.value, email: userEmail.value, type: userType.value, uid: "", };
		
		// initialise and use the backend function to create the user
		const createUser = functions.httpsCallable("createUser");
		createUser(newUser)
		.then( result => {
			// send a password reset so the user can set their own password
			auth.sendPasswordResetEmail(userEmail.value);
			poptoast(result.data.message, "green");
		}).catch((error) => {
			poptoast(error.message, "error");
		});
		MicroModal.close("user-modal");
	};	
	hideLoader();
}

/*******************************************************************
* this function updates an existing user
*******************************************************************/
function updateUserDetails(){
	showLoader();
	if(validateForm(userForm)){
		const updateUser = functions.httpsCallable("updateUser");

		// create a user object from the form and send to the backend function
		var newUser = { name: userName.value, email: userEmail.value, type: userType.value, uid: currentUID, oldType: currentType, };
		console.log(newUser);
		updateUser(newUser)
		.then( result => {
			poptoast(result.data.message, "green");
		}).catch((error) => {
			poptoast(error.message, "error");
		});
		MicroModal.close("user-modal");
	};	
	hideLoader();
}

/*******************************************************************
* this function displays the users onscreen 
*******************************************************************/
function populateUsers(data){
	const userContent = document.querySelector("#content");
	
	let userList = "";

	data.forEach(doc => {
		const user = doc.data();
		// populate the template
		const userHtml = `
			<div>
				<span>
					<a href="javascript:showUser('${doc.id}');">${user.name}</a>
				</span>
				<span>${user.email}</span>
				<span>${user.usertype}</span>
				<span>
					<button class="button small green waves-effect waves-light" onclick="deleteUser('${doc.id}');"><i class="fas fa-trash-alt"></i></button>
					<button class="button small green waves-effect waves-light" onclick="showUser('${doc.id}');"><i class="fas fa-edit"></i></button>
				</span>
			</div>
		`;
		userList += userHtml;
	});

	userContent.innerHTML = userList;
}

window.addEventListener("DOMContentLoaded", (event) => {
	// onBlur validators for controls
	userName.addEventListener("blur", (event) => { validateControl(userName); });
	userType.addEventListener("blur", (event) => { validateControl(userType); });
	userEmail.addEventListener("blur", (event) => { validateControl(userEmail); });

	/*******************************************************************
	* this function fires when the authentication state of the user has
	* changed - whether they log out or the session expires
	*******************************************************************/
	auth.onAuthStateChanged( user => {
		showLoader();
		if (auth.currentUser) {
			displayName.innerHTML = auth.currentUser.displayName;
			auth.currentUser.getIdTokenResult().then(idTokenResult => {
				if (idTokenResult.claims.role == "Administrator"){
					// populate the page only if the current user is an admin
					query.orderBy("name").limit(numPerPage).onSnapshot(snapshot => {
						populateUsers(snapshot.docs);
						lastVisible = snapshot.docs[snapshot.docs.length-1];
						numRecords = snapshot.docs.length;
					});
					hideLoader();
				} else {
					// redirect to login page if they arent an admin
					hideLoader();
					poptoast("Only an Administrator can view this content", "error");
					window.location.href = "../index.html";
				};
			})
		} else {
			window.location.href = "../index.html";
		};
	});

	/*******************************************************************
	* this function fires when the back button is clicked and allows 
	* for backwards pagination through records
	*******************************************************************/
	document.querySelector("#back").addEventListener("click", (event) => { 
		showLoader();
		auth.currentUser.getIdTokenResult()
		.then(idTokenResult => {
			if (idTokenResult.claims.role == "Administrator"){
				query.orderBy("name").endAt(lastVisible).limit(numPerPage).onSnapshot(snapshot => {
					populateUsers(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only an Administrator can view this content", "error");
			};
		});
		hideLoader();
	});

	/*******************************************************************
	* this function fires when the next button is clicked and allows 
	* for forwards pagination through records
	*******************************************************************/
	document.querySelector("#next").addEventListener("click", (event) => { 
		showLoader();
		auth.currentUser.getIdTokenResult()
		.then(idTokenResult => {
			if (idTokenResult.claims.role == "Administrator"){
				query.orderBy("name").startAt(lastVisible).limit(numPerPage).onSnapshot(snapshot => {
					populateUsers(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only an Administrator can view this content", "error");
			};
		});
		hideLoader();
	});

	/*******************************************************************
	* this function fires when the search functionality is used
	*******************************************************************/
	document.querySelector("#search-form").addEventListener("submit", (event) => {
		showLoader();
		event.preventDefault();
		const search = document.querySelector("#search");

		// switch between search and regular query
		if(search.value != ""){
			console.log("here",search.value);
			query = db.collection("users").where("name", ">=", search.value).where("name", "<=", search.value + "\uf8ff");
		} else {
			query = db.collection("users")
		}

		auth.currentUser.getIdTokenResult().then(idTokenResult => {
			if (idTokenResult.claims.role == "Administrator"){
				// if user is an admin, populate the page
				query.orderBy("name").limit(numPerPage).onSnapshot(snapshot => {
					populateUsers(snapshot.docs);
					console.log("output",snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					numRecords = snapshot.docs.length;
				}, (error) => {
					poptoast(error.message, "error");
				});
			} else {
				poptoast("Only an Administrator can view this content", "error");
			};
		});	
		hideLoader();
	});
});
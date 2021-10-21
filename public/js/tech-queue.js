const displayName = document.querySelector("#display-name");

const numPerPage = 10;
var lastVisible = null;
var firstVisible = null;
var numRecords = 0;
var currentUID = null;
var currentType = null;
let maxUsers = 0;

var query = db.collection("repeats").where("status", "in", ["Active", "Partially Dispensed", "Processing"]);

/*******************************************************************
* this function populates the onscreen "table" with the repeat 
* repeat prescription information returned from the database
*******************************************************************/
function populatePrescriptions(data){
	const repeatContent = document.querySelector("#content");
	
	let repeatList = "";

	// for each document returned fromt he DB
	data.forEach(doc => {
		const repeat = doc.data();
		// populate the template
		const repeatHtml = `
			<div>
				<span>
					<a href="javascript:showPrescription('${doc.id}');">${repeat.patientName}</a>
				</span>
				<span>${repeat.patientAddress}</span>
				<span>${repeat.dueDate.toDate().toLocaleDateString('en-GB')}</span>
				<span>${repeat.highestRestriction}</span>
				<span>${repeat.status}</span>
				<span>
					<button class="button small green waves-effect waves-light" onclick="showPrescription('${doc.id}');"><i class="fas fa-hand-holding-medical"></i></button>
				</span>
			</div>
		`;
		repeatList += repeatHtml;
	});
	// display
	repeatContent.innerHTML = repeatList;
}


function requestApproval(repeatID, medicationID){
	let medfield = medicationID.replace(/[&-\s]/gi, "_");
	let repeatUpdate = {};
	repeatUpdate[`medicationList.${medfield}.status`] = "Approval Requested";
	repeatUpdate.requested = "true";
	db.collection("repeats").doc(repeatID).update(repeatUpdate)
	.then(() => {
		return db.collection("approvals").doc("all").update({
			waiting: firebase.firestore.FieldValue.arrayUnion(repeatID),
		});
	})
	.then(() => {
		poptoast("Approval Request Sent", "green");
		showPrescription(repeatID);
	})
	.catch((error) => {
		poptoast(error.message, "error");
	});
}

/*******************************************************************
* this function dispenses the current prescription 
*******************************************************************/
function dispensePrescription(repeatID, patientID){
	// create a const to refer to the backend function
	const dispense = functions.httpsCallable("dispensePrescription");
	var prescription = { repeatID: repeatID, };
	//run the backend function
	dispense(prescription)
	.then(() => {
		db.collection("patients").doc(patientID).get()
		.then(patientDoc => {
			const patient = patientDoc.data();
			const mobileNumber = patient.mobile;
			/* make API call to send an SMS message to the patient here
			using the patient mobile data */
			MicroModal.close("dispense-modal");
			poptoast("Prescription Dispensed and Patient Notification Sent to "+ mobileNumber, "green");
		});
	})
	.catch((error) => {
		poptoast(error.message, "error");
	});
}

/*******************************************************************
* this function displays the popup containing the prescription information 
*******************************************************************/
function showPrescription(uid){
	showLoader();
	const infoContent = document.querySelector("#info-display");

	// get the repeat with a matching uid
	db.collection("repeats").doc(uid).get()
	.then(repeatDoc => {
		if (repeatDoc.exists) {
			const repeat = repeatDoc.data();
      		const patQuery = db.collection("patients").doc(repeat.nhsNumber).get();
			const preQuery = db.collection("prescriptions").doc(repeat.prescriptionId).get();
			const gpQuery = db.collection("gps").doc(repeat.gpNumber).get();

			// run all 3 queries asynchronously and wait for results
			Promise.all([patQuery, preQuery, gpQuery])
			.then((snapshot) => {	

				// fill in the patient and GP data in the top section
				if (snapshot[0].exists && snapshot[1].exists && snapshot[2].exists) {
					const patient = snapshot[0].data();
					const prescription = snapshot[1].data();
					const gp = snapshot[2].data();
					const prescriptionHtml = `
					<div>
						<div class="form-row">
							<p>
								<i class="far fa-user"></i> Patient Name
								<span>${prescription.patientName}</span>
							</p>
							<p>
							<i class="far fa-id-card"></i> NHS Number
								<span>${prescription.nhsNumber}</span>
							</p>
							<p>
								<i class="fas fa-house-user"></i> Patient Address
								<span>${prescription.address}</span>
							</p>
							<p>
								<i class="fas fa-phone-square"></i> Patient Phone Numbers								
								<span><i class="fas fa-phone-alt"></i> ${patient.telephone}</span>
								<span><i class="fas fa-mobile-alt"></i> ${patient.mobile}</span>
							</p>
						</div>
					</div>
					<div>
						<div class="form-row">
							<p>
								<i class="fas fa-user-md"></i> GP Name
								<span>${gp.name}</span>
							</p>
							<p>
								<i class="far fa-id-card"></i> GP Number
								<span>${repeat.gpNumber}</span>
							</p>
							<p>
								<i class="fas fa-hospital"></i> Surgery Address
								<span>${gp.address}</span>
							</p>
						</div>
					</div>`;

					infoContent.innerHTML = prescriptionHtml;
					

					// iterate through the medication information and set up the medication list at the bottom of the popup
					const medContent = document.querySelector("#med-content");
	
					let medsList = "";
					const colorlist = ["empty", "green","orange","red"];
					let dispensible = 0;
					let medCount = 0;

					// check each medication
					Object.keys(repeat.medicationList).forEach(e => {
						const currMed = repeat.medicationList[e];
						medCount++;
						let action = "";					
						
						// set the associated actiuon based on the status of the medication
						switch (currMed.status) {
							case "Can Dispense":
							  	action = `<i class="fas fa-check-circle green"></i> Can Dispense`;
								dispensible++;
							  	break;
							case "Dispensed":
								action = `<i class="fas fa-times-circle red"></i> Already Dispensed`;
								break;
							case "Approval Requested":
								action = `<i class="fas fa-hourglass-start"></i> Approval Requested`;
								break;
							case "Approval Granted":
								action = `<i class="fas fa-check-circle green"></i> Can Dispense`;
								dispensible++;
								break;
							case "Bloodwork / Approval Required":
								action = `<button class="button orange waves-effect waves-light" title="Request Approval" onclick="javascript:requestApproval('${uid}','${currMed.medicationName}');"><i class="fas fa-bell"></i> Request</button>`;				  
							  	break;
							case "Bloodwork Required":
							  	action = `<i class="fas fa-times-circle red"></i> Cannot Dispense`;
							  	break;
						  }

						// populate the template
						const medHtml = `
						<div>
							<span>${currMed.medicationName}</span>
							<span>${currMed.instructions}</span>
							<span><i class="fas fa-circle ${colorlist[currMed.restrictionLevel]}"></i> Level ${currMed.restrictionLevel}</span>
							<span>${currMed.bloodworkFails}</span>
							<span>${currMed.status}</span>
							<span>${action}</span>
						</div>`;
						medsList += medHtml;
					});
					
					// set up the buttons which allow for for dispensing 
					const medButtons = document.querySelector("#med-buttons");
					if (dispensible > 0) {
						if (dispensible < medCount) {
							medButtons.innerHTML = `<button class="button green waves-effect waves-light" title="Partially Dispense" onclick="dispensePrescription('${uid}','${prescription.nhsNumber}');"><i class="fas fa-hand-holding-medical"></i> Partially Dispense Prescription</button>`;
						} else {
							medButtons.innerHTML = `<button class="button green waves-effect waves-light" title="Dispense" onclick="dispensePrescription('${uid}', '${prescription.nhsNumber}');"><i class="fas fa-hand-holding-medical"></i> Dispense Prescription</button>`;
						}
					}					
					medContent.innerHTML = medsList;

					// show the popup
					MicroModal.show("dispense-modal");
				} else {
					poptoast("This Prescription does not exist", "error");
				};
			});
			MicroModal.show("dispense-modal");
		} else {
			poptoast("This Prescription repeat does not exist", "error");
		};
	});

	hideLoader();
}

window.addEventListener("DOMContentLoaded", (event) => {
	//window loaded

	/*******************************************************************
	* this function fires when the authentication state of the user has
	* changed - whether they log out or the session expires
	*******************************************************************/
	auth.onAuthStateChanged( user => {
		showLoader();
		if (auth.currentUser) {
			// change the name in the top left
			displayName.innerHTML = auth.currentUser.displayName;
			auth.currentUser.getIdTokenResult().then(idTokenResult => {
				//check if the user has sufficient permissions
				if (idTokenResult.claims.role == "Technician"){
					// populate the prescriptions onscreen from the table
					query.orderBy("patientName").limit(numPerPage).onSnapshot(snapshot => {
						populatePrescriptions(snapshot.docs);
						lastVisible = snapshot.docs[snapshot.docs.length-1];
						firstVisible = snapshot.docs[0];
						numRecords = snapshot.docs.length;
					});
				} else {
					//error and redirect
					poptoast("Only a Technician can view this content", "error");
					window.location.href = "../index.html";
				};
			})
		} else {
			// if nobody is logged in, redirect
			window.location.href = "../index.html";
		};
		hideLoader();
	});


	/*******************************************************************
	* this function fires when the back button is clicked and allows 
	* for backwards pagination through records
	*******************************************************************/
	document.querySelector("#back").addEventListener("click", (event) => { 
		auth.currentUser.getIdTokenResult()
		.then(idTokenResult => {
			// only a Technician has access
			if (idTokenResult.claims.role == "Technician"){
				query.orderBy("patientName").endAt(firstVisible).limitToLast(numPerPage).onSnapshot(snapshot => {
					populatePrescriptions(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					firstVisible = snapshot.docs[0];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only a Technician can view this content", "error");
			};
		});
	});

	/*******************************************************************
	* this function fires when the back button is clicked and allows 
	* for forwards pagination through records
	*******************************************************************/
	document.querySelector("#next").addEventListener("click", (event) => { 
		auth.currentUser.getIdTokenResult()
		.then(idTokenResult => {
			if (idTokenResult.claims.role == "Technician"){
				query.orderBy("patientName").startAt(lastVisible).limit(numPerPage).onSnapshot(snapshot => {
					populatePrescriptions(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					firstVisible = snapshot.docs[0];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only a Technician can view this content", "error");
			};
		});
	});


	/*******************************************************************
	* this function fires when the search functionality is used
	*******************************************************************/
	document.querySelector("#search-form").addEventListener("submit", (event) => {
		event.preventDefault();
		const search = document.querySelector("#search");

		//toggle between "normal" and "search" queries
		if(search.value != ""){
			query = db.collection("repeats").where("status", "in", ["Active", "Partially Dispensed", "Processing"]).where("patientName", ">=", search.value).where("patientName", "<=", search.value + "\uf8ff");
		} else {
			query = db.collection("repeats").where("status", "in", ["Active", "Partially Dispensed", "Processing"]);
		}

		//check authentication and display results
		auth.currentUser.getIdTokenResult().then(idTokenResult => {
			if (idTokenResult.claims.role == "Technician"){
				query.orderBy("patientName").limit(numPerPage).onSnapshot(snapshot => {
					populatePrescriptions(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					firstVisible = snapshot.docs[0];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only a Technician can view this content", "error");
			};
		});	
	});
});
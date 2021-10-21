const displayName = document.querySelector("#display-name");

const numPerPage = 10;
var lastVisible = null;
var firstVisible = null;
var numRecords = 0;
var currentUID = null;
var currentType = null;
let maxUsers = 0;

var query = db.collection("repeats").where("requested", "==", "true");

/*******************************************************************
* this function grants approval for the given medication
*******************************************************************/
function grantApproval(repeatID, medicationID){
	let medfield = medicationID.replace(/[&-\s]/gi, "_");
	let repeatUpdate = {};
	repeatUpdate[`medicationList.${medfield}.status`] = "Approval Granted";
	repeatUpdate.requested = firebase.firestore.FieldValue.delete();
	db.collection("repeats").doc(repeatID).update(repeatUpdate)
	.then(() => {
		return db.collection("approvals").doc("all").update({
			waiting: firebase.firestore.FieldValue.arrayRemove(repeatID),
		});
	})
	.then(() => {
		poptoast("Approval Granted", "green");
		showPrescription(repeatID);
	})
	.catch((error) => {
		poptoast(error.message, "error");
	});
}

/*******************************************************************
* this function displays the prescriptions onscreen 
*******************************************************************/
function populatePrescriptions(data){
	const repeatContent = document.querySelector("#content");
	
	let repeatList = "";

	data.forEach(doc => {
		const repeat = doc.data();
		const repeatHtml = `
			<div>
				<span>
					<a href="javascript:showPrescription('${doc.id}');" title="View Prescription">${repeat.patientName}</a>
				</span>
				<span>${repeat.patientAddress}</span>
				<span>${repeat.dueDate.toDate().toLocaleDateString('en-GB')}</span>
				<span>${repeat.highestRestriction}</span>
				<span>${repeat.status}</span>
				<span>
					<button class="button small purple waves-effect waves-light" title="View Prescription" onclick="showPrescription('${doc.id}');"><i class="fas fa-eye"></i></button>
				</span>
			</div>
		`;
		repeatList += repeatHtml;
	});

	repeatContent.innerHTML = repeatList;
}

/*******************************************************************
* this function displays the current prescription in a popup
*******************************************************************/
function showPrescription(uid){
	showLoader();
	const infoContent = document.querySelector("#info-display");

	db.collection("repeats").doc(uid).get()
	.then(repeatDoc => {
		if (repeatDoc.exists) {
			const repeat = repeatDoc.data();
      		const patQuery = db.collection("patients").doc(repeat.nhsNumber).get();
			const preQuery = db.collection("prescriptions").doc(repeat.prescriptionId).get();
			const gpQuery = db.collection("gps").doc(repeat.gpNumber).get();

			Promise.all([patQuery, preQuery, gpQuery])
			.then((snapshot) => {	

				// populate patient and GP data
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
					
					const medContent = document.querySelector("#med-content");
	
					let medsList = "";
					const colorlist = ["empty", "green","orange","red"];

					// populate the medication information
					Object.keys(repeat.medicationList).forEach(e => {
						const currMed = repeat.medicationList[e];
						let action = "";					
						
						if (currMed.status == "Approval Requested") {
							action = `<button class="button orange waves-effect waves-light" title="Request Approval" onclick="javascript:grantApproval('${uid}','${currMed.medicationName}');"><i class="fas fa-bell"></i> Approve</button>`;				  
						}

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
					
									
					medContent.innerHTML = medsList;
					MicroModal.show("dispense-modal")
				} else {
					poptoast("This Prescription does not exist", "error");
				};
			});
			MicroModal.show("dispense-modal")
		} else {
			poptoast("This Prescription repeat does not exist", "error");
		};
	});
	hideLoader();
}

window.addEventListener("DOMContentLoaded", (event) => {

	/*******************************************************************
	* this function fires when the authentication state of the user has
	* changed - whether they log out or the session expires
	*******************************************************************/
	auth.onAuthStateChanged( user => {
		showLoader();
		if (auth.currentUser) {
			displayName.innerHTML = auth.currentUser.displayName;
			auth.currentUser.getIdTokenResult().then(idTokenResult => {
				if (idTokenResult.claims.role == "Pharmacist"){
					query.orderBy("patientName").limit(numPerPage).onSnapshot(snapshot => {
						populatePrescriptions(snapshot.docs);
						lastVisible = snapshot.docs[snapshot.docs.length-1];
						firstVisible = snapshot.docs[0];
						numRecords = snapshot.docs.length;
					});
				} else {
					poptoast("Only a Pharmacist can view this content", "error");
					window.location.href = "../index.html";
				};
			})
		} else {
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
			if (idTokenResult.claims.role == "Pharmacist"){
				query.orderBy("patientName").endAt(firstVisible).limitToLast(numPerPage).onSnapshot(snapshot => {
					populatePrescriptions(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					firstVisible = snapshot.docs[0];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only a Pharmacist can view this content", "error");
			};
		});
	});

	/*******************************************************************
	* this function fires when the next button is clicked and allows 
	* for forwards pagination through records
	*******************************************************************/
	document.querySelector("#next").addEventListener("click", (event) => { 
		auth.currentUser.getIdTokenResult()
		.then(idTokenResult => {
			if (idTokenResult.claims.role == "Pharmacist"){
				query.orderBy("patientName").startAt(lastVisible).limit(numPerPage).onSnapshot(snapshot => {
					populatePrescriptions(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					firstVisible = snapshot.docs[0];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only a Pharmacist can view this content", "error");
			};
		});
	});

	/*******************************************************************
	* this function fires when the search functionality is used
	*******************************************************************/
	document.querySelector("#search-form").addEventListener("submit", (event) => {
		event.preventDefault();
		const search = document.querySelector("#search");

		if(search.value != ""){
			query = db.collection("repeats").where("requested", "==", "true").where("patientName", ">=", search.value).where("patientName", "<=", search.value + "\uf8ff");
		} else {
			query = db.collection("repeats").where("requested", "==", "true");
		}

		auth.currentUser.getIdTokenResult().then(idTokenResult => {
			if (idTokenResult.claims.role == "Pharmacist"){
				query.orderBy("patientName").limit(numPerPage).onSnapshot(snapshot => {
					populatePrescriptions(snapshot.docs);
					lastVisible = snapshot.docs[snapshot.docs.length-1];
					firstVisible = snapshot.docs[0];
					numRecords = snapshot.docs.length;
				});
			} else {
				poptoast("Only a Pharmacist can view this content", "error");
			};
		});	
	});
});
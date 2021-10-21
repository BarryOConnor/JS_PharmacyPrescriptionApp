const displayName = document.querySelector("#display-name");
const prescriptions = document.querySelector("#prescriptions");
const approvals = document.querySelector("#approvals");

window.addEventListener("DOMContentLoaded", (event) => {
	/*******************************************************************
	* this function displays the circles on the index
	*******************************************************************/
	auth.onAuthStateChanged( user => {
		showLoader();
		if (auth.currentUser) {
			displayName.innerHTML = auth.currentUser.displayName;
			auth.currentUser.getIdTokenResult().then(idTokenResult => {
				if (idTokenResult.claims.role == "Pharmacist"){
					let approval = 0;
					let level3 = 0;
					let level2 = 0;
					let level1 = 0;
					db.collection("repeats").where("status", "in", ["Active", "Partially Dispensed", "Processing"]).get()
					.then((querySnapshot) => {
						querySnapshot.forEach((docData) => {
							var currdoc = docData.data()
							console.log(currdoc.requested + " : " + currdoc.highestRestriction);
							if (currdoc.requested=="true") { approval++; }
							if (currdoc.highestRestriction==1) { level1++; }
							if (currdoc.highestRestriction==2) { level2++; }
							if (currdoc.highestRestriction==3) { level3++; }

						})
						approvals.innerHTML = `<div class="circle purple">${approval}
													<span>Requests</span>
												</div>`;
						prescriptions.innerHTML = `<div class="circle green">${level1}
														<span>Level 1</span>
													</div><div class="circle orange">${level2}
														<span>Level 2</span>
													</div><div class="circle red">${level3}
														<span>Level 3</span>
													</div>`;
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

});
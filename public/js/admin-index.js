
const displayName = document.querySelector("#display-name");

/*******************************************************************
* this function displays the graphs on the index page
*******************************************************************/
function drawGraph(data){
	const graph = document.querySelector("#chart-content");
	const total = data.Technician + data.Pharmacist + data.Administrator;
	const valueOfOne = 100 / total;
	const userHtml = `
		<li class="bar green" style="width: ${valueOfOne * data.Technician}%;">
			<span class="label">Technician: ${data.Technician}</span>
		</li>
		<li class="bar purple" style="width: ${valueOfOne * data.Pharmacist}%;">
			<span class="label">Pharmacist: ${data.Pharmacist}</span>
		</li>
		<li class="bar grey" style="width: ${valueOfOne * data.Administrator}%;">
			<span class="label">Administrator: ${data.Administrator}</span>
		</li>
	`;
	graph.innerHTML = userHtml;

}

window.addEventListener("DOMContentLoaded", (event) => {
	hideLoader();

	/*******************************************************************
	* this checks for an admin and displays the page content
	*******************************************************************/
	auth.onAuthStateChanged( user => {
		showLoader();
		if (auth.currentUser) {
			displayName.innerHTML = auth.currentUser.displayName;
			auth.currentUser.getIdTokenResult().then(idTokenResult => {
				if (idTokenResult.claims.role == "Administrator"){
					// display the content only if the user is an administrator
					db.collection("rowcounts").doc("all").onSnapshot(snapshot => {
						drawGraph(snapshot.data());
						hideLoader();
					}, (error) => {
						hideLoader();
						poptoast(error.message, "error");
					});
				} else {
					poptoast("Only an Administrator can view this content", "error");
					window.location.href = "../index.html";
				};
			})
		} else {
			window.location.href = "../index.html";
		};
	});
});
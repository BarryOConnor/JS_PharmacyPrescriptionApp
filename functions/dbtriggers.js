const functions = require("firebase-functions");
const admin = require("firebase-admin");

const medsList = admin.firestore().collection("medications").doc("all");
const rptTable = admin.firestore().collection("repeats");
const patTable = admin.firestore().collection("patients");

/** *****************************************************************
* This DB Trigger fires when a prescription is created
*
* input:
* change: firebase changes detailing what info changed in the document
* context: context information supplied by firebase
*
*******************************************************************/
exports.prescriptionCreated = functions.firestore
    .document("prescriptions/{prescriptionId}")
    .onCreate((change, context) => {
      // Get an object representing the document
      const prescription = change.data();

      // get the list of medications from the DB
      return medsList.get()
          .then((snapshot) => {
            const medSheet = snapshot.data();
            const repeatMeds = {};
            let highestRating = 0;
            const medications = prescription.medications;

            // for each medication do the following
            medications.forEach((medication) => {
              const field = medication.medicationName.replace(/[&-\s]/gi, "_");
              // calculate the highest restriction level for the prescription
              if (medSheet[field].restrictionLevel > highestRating) {
                highestRating = medSheet[field].restrictionLevel;
              }

              // populate the information for each medication
              repeatMeds[field] = {
                medicationName: medication.medicationName,
                instructions: medication.instructions,
                restrictionLevel: medSheet[field].restrictionLevel,
                bloodwork: medSheet[field].bloodwork,
                bloodworkFails: "none",
                status: "queue",
              };
            });

            // need to use promises as the functions are async
            const promises = [];
            const tempDate = prescription.issueDate.toDate();

            // create a new repeat for each month the prescription is active
            for (let loop = 0; loop < prescription.duration; loop++) {
              let status = "Queued";

              if ( loop == 0 ) {
                status = "Active";
              } else {
                tempDate.setMonth(tempDate.getMonth() + 1);
              }
              // populate with data
              const repeatdate = admin.firestore.Timestamp.fromDate(tempDate);
              const newRepeat = {
                prescriptionId: context.params.prescriptionId,
                nhsNumber: prescription.nhsNumber,
                gpNumber: prescription.gpNumber,
                patientName: prescription.patientName,
                patientAddress: prescription.address,
                highestRestriction: highestRating,
                medicationList: repeatMeds,
                dueDate: repeatdate,
                status: status,
              };

              // store the query
              const promise = rptTable.add(newRepeat);
              promises.push(promise);
            }

            // execute all queries
            return Promise.all(promises);
          });
    });

/** *****************************************************************
* This DB Trigger fires when a repeat is created or updated.
*
* input:
* change: firebase changes detailing what info changed in the document
* context: context information supplied by firebase
*
*******************************************************************/
exports.repeatChanged = functions.firestore
    .document("repeats/{repeatId}")
    .onWrite((change, context) => {
      // dont run for a delete operation
      if (!change.after.exists) {
        return;
      }

      const repeat = change.after.data();
      // only run for the active queue
      if (repeat.status == "Active" && repeat.updatedBy != "patient") {
        return patTable.doc(repeat.nhsNumber).get().then((snapshot) => {
          const patient = snapshot.data();

          // run for each medication on the list
          Object.keys(repeat.medicationList).forEach((e) => {
            const currMed = repeat.medicationList[e];

            // work out the bloodwork needed by comparing to the patient
            if (currMed.status != "Dispensed" &&
            currMed.status != "Approval Requested" &&
            currMed.status != "Approval Granted" &&
            currMed.status != "Partially Dispensed") {
              currMed.bloodworkFails = "";
              const bloodworkItems = currMed.bloodwork.split(",");

              // implement a list of items that fail
              bloodworkItems.forEach((bloodworkItem) => {
                const bloodwork = bloodworkItem.split(":");
                const field = bloodwork[0].replace(/[&-\s]/gi, "_");

                if (bloodwork[0] != "none") {
                  if (patient[field] == null) {
                    currMed.bloodworkFails += bloodwork[0] + ", ";
                  } else {
                    const tempDate = patient[field].toDate();
                    tempDate.setMonth(tempDate.getMonth() + parseInt(bloodwork[1]));
                    if (tempDate < repeat.dueDate.toDate()) {
                      currMed.bloodworkFails += bloodwork[0] + ", ";
                    }
                  }
                } else {
                  currMed.bloodworkFails = "None";
                }
              });

              // use the fail list to decide whether the medication can be distributed
              if (currMed.bloodworkFails == "") {
                currMed.bloodworkFails = "Up to Date";
              } else if (currMed.bloodworkFails != "None") {
                currMed.bloodworkFails = currMed.bloodworkFails.substring(0, currMed.bloodworkFails.length - 2);
              }

              // set the status of each medication
              switch (currMed.restrictionLevel) {
                case 1:
                  currMed.status = "Can Dispense";
                  break;
                case 2:
                  if (currMed.bloodworkFails == "Up to Date" || currMed.bloodworkFails == "None") {
                    currMed.status = "Can Dispense";
                  } else {
                    currMed.status = "Bloodwork / Approval Required";
                  }
                  break;
                case 3:
                  if (currMed.bloodworkFails == "Up to Date" || currMed.bloodworkFails == "None") {
                    currMed.status = "Can Dispense";
                  } else {
                    currMed.status = "Bloodwork Required";
                  }
                  break;
              }
            }
          });

          rptTable.doc(change.after.id).update(repeat)
              .then(()=>{
                return true;
              });
        });
      }
    });

/** *****************************************************************
* This DB Trigger fires when a patient is updated. This is to allow
* bloodwork updates to filter through to the repeats
*
* input:
* change: firebase changes detailing what info changed in the document
* context: context information supplied by firebase
*
*******************************************************************/
exports.patientChanged = functions.firestore
    .document("patients/{patientId}")
    .onUpdate((change, context) => {
      const patient = change.after.data();

      // only apply to incomplete and active repeats
      rptTable.where("nhsNumber", "==", context.params.patientId).where("status", "in", ["Active", "Partially Dispensed", "Processing"]).get()
          .then((snapshot) => {
            const promises = [];

            // for each repeat that matches
            snapshot.forEach((document) => {
              const repeat = document.data();

              // for each medication on the repeat update the medication
              // works the same as the previous trigger
              Object.keys(repeat.medicationList).forEach((e) => {
                const currMed = repeat.medicationList[e];

                if (currMed.status != "Dispensed" &&
                currMed.status != "Approval Requested" &&
                currMed.status != "Approval Granted" &&
                currMed.status != "Partially Dispensed") {
                  currMed.bloodworkFails = "";
                  const bloodworkItems = currMed.bloodwork.split(",");

                  bloodworkItems.forEach((bloodworkItem) => {
                    const bloodwork = bloodworkItem.split(":");
                    const field = bloodwork[0].replace(/[&-\s]/gi, "_");

                    if (bloodwork[0] != "none") {
                      if (patient[field] == null) {
                        currMed.bloodworkFails += bloodwork[0] + ", ";
                      } else {
                        const tempDate = patient[field].toDate();
                        tempDate.setMonth(tempDate.getMonth() + parseInt(bloodwork[1]));
                        if (tempDate < repeat.dueDate.toDate()) {
                          currMed.bloodworkFails += bloodwork[0] + ", ";
                        }
                      }
                    } else {
                      currMed.bloodworkFails = "None";
                    }
                  });

                  if (currMed.bloodworkFails == "") {
                    currMed.bloodworkFails = "Up to Date";
                  } else if (currMed.bloodworkFails != "None") {
                    currMed.bloodworkFails = currMed.bloodworkFails.substring(0, currMed.bloodworkFails.length - 2);
                  }

                  switch (currMed.restrictionLevel) {
                    case 1:
                      currMed.status = "Can Dispense";
                      break;
                    case 2:
                      if (currMed.bloodworkFails == "Up to Date" || currMed.bloodworkFails == "None") {
                        currMed.status = "Can Dispense";
                      } else {
                        currMed.status = "Bloodwork / Approval Required";
                      }
                      break;
                    case 3:
                      if (currMed.bloodworkFails == "Up to Date" || currMed.bloodworkFails == "None") {
                        currMed.status = "Can Dispense";
                      } else {
                        currMed.status = "Bloodwork Required";
                      }
                      break;
                  }
                }
              });
              repeat.updatedBy = "patient";

              promises.push(document.ref.update(repeat));
            });
            Promise.all(promises)
                .then(()=>{
                  return true;
                });
          });
    });

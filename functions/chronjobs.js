const functions = require("firebase-functions");
const admin = require("firebase-admin");

const rptTable = admin.firestore().collection("repeats");
const patTable = admin.firestore().collection("patients");

/** *****************************************************************
* this chron task runs at 6am every morning and sets any prescriptions due in the next 7 days as
* active to give the pharmacy time to process them
*******************************************************************/
exports.createRepeatQueue = functions.pubsub.schedule("0 6 * * *")
    .timeZone("Europe/London") // Users can choose timezone - default is America/Los_Angeles
    .onRun((context) => {
      const oneWeekLater = new Date();
      oneWeekLater.setDate(oneWeekLater.getDate() + 7);
      const today = new Date();

      // update any repeats due in the next week and set them to be active
      rptTable.where("dueDate", ">=", today).where("dueDate", "<=", oneWeekLater).get()
          .then((snapshot) => {
            const promises = [];

            snapshot.forEach((document) => {
              const repeat = document.data();
              if (repeat.status == "queue") {
                // set as active
                promises.push(document.ref.update({
                  status: "Active",
                }));
              }
            });
            return Promise.all(promises);
          });
    });


/** *****************************************************************
* this chron task runs at 01:01 am on the first day of the month and
* sends a bloodwork request list for each patient to the doctor
*******************************************************************/
exports.createBloodworkRequests = functions.pubsub.schedule("01 01 1 * *")
    .timeZone("Europe/London") // Users can choose timezone - default is America/Los_Angeles
    .onRun((context) => {
      const rightNow = new Date();
      const oneMonthLater = new Date();
      oneMonthLater.setDate(oneMonthLater.getDate() + 30);

      rptTable.where("dueDate", ">=", rightNow).where("dueDate", "<=", oneMonthLater).get()
          .then((snapshot) => {
            const bloodworkRequests = [];

            snapshot.forEach((document) => {
              const repeat = document.data();

              return patTable.doc(repeat.nhsNumber).get().then((snapshot) => {
                const patient = snapshot.data();

                Object.keys(repeat.medicationList).forEach((e) => {
                  const currMed = repeat.medicationList[e];
                  let bloodworkNeeded = "";

                  if (currMed.status != "Dispensed" &&
                  currMed.status != "Approval Requested" &&
                  currMed.status != "Approval Granted" &&
                  currMed.status != "Partially Dispensed") {
                    const bloodworkItems = currMed.bloodwork.split(",");

                    bloodworkItems.forEach((bloodworkItem) => {
                      const bloodwork = bloodworkItem.split(":");
                      const field = bloodwork[0].replace(/[&-\s]/gi, "_");

                      if (bloodwork[0] != "none") {
                        if (patient[field] == null) {
                          bloodworkNeeded += bloodwork[0] + ", ";
                        } else {
                          const tempDate = patient[field].toDate();
                          tempDate.setMonth(tempDate.getMonth() + parseInt(bloodwork[1]));
                          if (tempDate < repeat.dueDate.toDate()) {
                            bloodworkNeeded += bloodwork[0] + ", ";
                          }
                        }
                      } else {
                        currMed.bloodworkFails = "None";
                      }
                    });

                    // create a list of bloodwork that isn't up to date
                    if (currMed.bloodworkFails != "None") {
                      bloodworkNeeded = bloodworkNeeded.substring(0, currMed.bloodworkFails.length - 2);
                      bloodworkRequests.push({
                        name: patient.name,
                        nhsNumber: repeat.nhsNumber,
                        bloodwork: bloodworkNeeded,
                      });
                    }

                    // define the content of the email
                    let emailContent = "";
                    bloodworkRequests.forEach((currPatient) => {
                      emailContent += `Patient Name: ${currPatient.name} <br/>
                      NHS Number: ${currPatient.nhsNumber} <br/>
                      Bloodwork required: ${currPatient.bloodworkNeeded} <br/>
                      <br/><br/>`;
                    });

                    // add to the mail table and let the mail extension handle the emails
                    admin.firestore().collection("mail").add({
                      to: "me@barryoconnor.co.uk",
                      message: {
                        subject: "Patient Bloodwork Request",
                        html: emailContent,
                      },
                    });
                  }
                });
                // return Promise.all(promises);
              });
            });
          });
    });

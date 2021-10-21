const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// references to tables
const userTable = admin.firestore().collection("users");
const rowcounts = admin.firestore().collection("rowcounts").doc("all");
const preTable = admin.firestore().collection("prescriptions");
const rptTable = admin.firestore().collection("repeats");

// import functions from other files
const triggers = require("./dbtriggers");
const chronjobs = require("./chronjobs");

exports.prescriptionCreated = triggers.prescriptionCreated;
exports.repeatChanged = triggers.repeatChanged;
exports.patientChanged = triggers.patientChanged;
exports.createRepeatQueue = chronjobs.createRepeatQueue;

/** *****************************************************************
* This function creates a new user
*
* input:
* data: a js object containing name, email and user type
* context: context information supplied by firebase
*
*******************************************************************/
exports.createUser = functions.https.onCall((data, context) => {
  // check if the person submitting is an Admin
  if (context.auth.token.role !== "Administrator") {
    throw new functions.https.HttpsError("failed-precondition",
        "Only an Administrator can perform this action.");
  }
  // create a user in Auth
  return admin.auth().createUser({
    email: data.email,
    emailVerified: false,
    password: Math.random().toString(36),
    displayName: data.name,
    disabled: false,
  })
      .then((userRecord) => {
        // set custom claims (user type)
        admin.auth().setCustomUserClaims(userRecord.uid, {
          role: data.type,
        });
        return userRecord;
      })
      .then((userRecord) => {
        // create a user in the database
        return userTable.doc(userRecord.uid).set({
          name: data.name,
          email: data.email,
          usertype: data.type,
        });
      })
      .then(() => {
        // increment the number of users of that type
        return rowcounts.update({
          [data.type]: admin.firestore.FieldValue.increment(1),
        });
      })
      .then(() => {
        return {
          message: "User was successfully created!",
        };
      })
      .catch((error) => {
        return {
          message: error.message,
        };
      });
});

/** *****************************************************************
* This function updates an existing user
*
* input:
* data: a js object containing name, email and user type
* context: context information supplied by firebase
*
*******************************************************************/
exports.updateUser = functions.https.onCall((data, context) => {
  // check if the person submitting is an Admin
  if (context.auth.token.role !== "Administrator") {
    throw new functions.https.HttpsError("failed-precondition",
        "Only an Administrator can perform this action.");
  }
  // update the user in Auth
  return admin.auth().updateUser(data.uid, {
    email: data.email,
    displayName: data.name,
  })
      .then((userRecord) => {
        // update user type in custom claims
        admin.auth().setCustomUserClaims(userRecord.uid, {
          role: data.type,
        });
        return userRecord;
      })
      .then((userRecord) => {
        // check if the person submitting is an Admin
        return userTable.doc(userRecord.uid).update({
          name: data.name,
          email: data.email,
          usertype: data.type,
        });
      })
      .then((docRef) => {
        // check if the update changed anything
        if (data.type == data.oldType) {
          return true;
        }
        // update the rowcount
        return rowcounts.update({
          [data.type]: admin.firestore.FieldValue.increment(1),
          [data.oldType]: admin.firestore.FieldValue.increment(-1),
        });
      })
      .then(() => {
        return {
          message: "User was successfully updated!",
        };
      })
      .catch((error) => {
        return {
          message: error.message,
        };
      });
});

/** *****************************************************************
* This function updates an existing user
*
* input:
* data: a js object containing name, email and user type
* context: context information supplied by firebase
*
*******************************************************************/
exports.deleteUser = functions.https.onCall((data, context) => {
  // check if the person submitting is an Admin
  if (context.auth.token.role !== "Administrator") {
    throw new functions.https.HttpsError("failed-precondition",
        "Only an Administrator can perform this action.");
  }

  let currType = "";
  // delete user in Auth
  return admin.auth().deleteUser(data.uid)
      .then(() => {
        return userTable.doc(data.uid).get();
      })
      .then((userData) => {
        // delete user in Database
        const user = userData.data();
        currType = user.usertype;
        return userTable.doc(data.uid).delete();
      })
      .then(() => {
        // update the rowcounts
        return rowcounts.update({
          [currType]: admin.firestore.FieldValue.increment(-1),
        });
      })
      .then(() => {
        return {
          message: "User was successfully deleted!",
        };
      })
      .catch((error) => {
        return {
          message: error.message,
        };
      });
});

/** *****************************************************************
* This function creates an entry when the prescription is submitted
*
* input:
* data: a js object containing patientName, nhsNumber, address
*       gpNumber, issueDate, duration, medicationList
* context: context information supplied by firebase
*
*******************************************************************/
exports.createPrescription = functions.https.onCall((data, context) => {
  const jsIssueDate = new Date(data.issueDate);
  const fbIssueDate = admin.firestore.Timestamp.fromDate(jsIssueDate);

  // add the prescription to the database
  return preTable.add({
    patientName: data.patientName,
    nhsNumber: data.nhsNumber,
    address: data.address,
    gpNumber: data.gpNumber,
    issueDate: fbIssueDate,
    duration: data.duration,
    medications: data.medicationList,
  })
      .then(() => {
        return {
          message: "Prescription added!",
        };
      })
      .catch((error) => {
        return {
          message: error.message,
        };
      });
});

/** *****************************************************************
* This function dispenses a prescription repeat
*
* input:
* data: a js object containing repeat id
* context: context information supplied by firebase
*
*******************************************************************/
exports.dispensePrescription = functions.https.onCall((data, context) => {
  // check user privileges
  if (context.auth.token.role !== "Technician" && context.auth.token.role !== "Pharmacist") {
    throw new functions.https.HttpsError("failed-precondition",
        "Only a Pharmacist or Technician can perform this action.");
  }
  // get the repeat info from the DB
  rptTable.doc(data.repeatID).get()
      .then((repeatDoc) => {
        if (repeatDoc.exists) {
          const repeat = repeatDoc.data();
          let dispensed = 0;
          let medCount = 0;
          // iterate the medications and set to dispensed if possible
          Object.keys(repeat.medicationList).forEach((e) => {
            const currMed = repeat.medicationList[e];
            medCount++;
            if (currMed.status == "Can Dispense" || currMed.status == "Approval Granted") {
              currMed.status = "Dispensed";
              dispensed++;
            }
          });
          // set the status for the repeat itself
          if (dispensed == medCount) {
            repeat.status = "Dispensed";
          } else {
            repeat.status = "Partially Dispensed";
          }
          // attach relevant information
          repeat.dispensedBy = context.auth.uid;
          repeat.dispensedDate = new Date();
          return rptTable.doc(data.repeatID).update(repeat);
        }
      })
      .then(() => {
        return {
          message: "Prescription Updated!",
        };
      })
      .catch((error) => {
        return {
          message: error.message,
        };
      });
});

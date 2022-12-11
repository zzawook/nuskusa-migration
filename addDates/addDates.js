import { dbService, authService, storageService } from "../firebaseFunctions.js"
import firebase from "firebase";

const id = process.env.FIREBASE_EMAIL_ID;
const password = process.env.FIREBASE_PASSWORD;
const eventId = process.env.EVENT_ID;

const targetDate = new Date();
targetDate.setFullYear(2022);
targetDate.setMonth(7);
targetDate.setDate(2);

authService.signInWithEmailAndPassword(id, password).then(() => {
    dbService.collection("events").doc(eventId).collection("registrations").get().then((docs) => {
        docs.forEach((doc) => {
            const data = doc.data();
            if (!data.responseAt) {
                dbService.collection("events").doc(eventId).collection("registrations").doc(doc.id).update({
                    responseAt: firebase.firestore.Timestamp.fromDate(targetDate),
                }).then(() => {
                    console.log("Updated " + doc.id);
                }).catch(err => {
                    console.log(err);
                })
            }
        })
    })
})
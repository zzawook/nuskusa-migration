import { dbService, authService, storageService } from "../firebaseFunctions.js"
import mysql from "mysql2/promise"

async function main() {
    const newDB = await mysql.createConnection({
        host: process.env.DBIP,
        user: process.env.PKR_VAR_MYSQL_USER,
        password: process.env.PKR_VAR_MYSQL_PASSWORD,
        database: process.env.PKR_VAR_MYSQL_DATABASE
    })
    authService.signInWithEmailAndPassword(process.env.FIREBASE_EMAIL_ID, process.env.FIREBASE_PASSWORD).then(async () => {
        await migrateEvents(newDB);
    });
}

function processEvent(event) {
    return {
        title: event.title ? event.title : null,
        description: event.description ? event.description : null,
        canApplyMultiple: event.canApplyMultiple ? event.canApplyMultiple : null,
        post: event.post0 ? event.post : null,
    }
}

async function migrateEvents(newDB) {
    console.log("Migrating Events")
    const eventDocs = await dbService.collection("events").get();
    const announcements = await dbService.collection("boards").doc("announcement").collection("posts").get()
    const now = new Date();

    eventDocs.forEach(async eventDoc => {
        const eventData = processEvent(eventDoc.data());
        let postId = null
        let content = null
        announcements.forEach(async doc => {
            const announcementData = doc.data()
            if (announcementData.title == eventData.title) {
                
                const postQuery = 'SELECT id from Posts where title=?'
                const [postRow, postField] = await newDB.execute(postQuery, [announcementData.title])
                postId = postRow[0].id
                content = announcementData.content
            }
        })
        const registrations = await dbService.collection("events").doc(eventDoc.id).collection("registrations").get();

        //MIGRATE EVENT DATA
        const eventQuery = 'INSERT INTO Events(title, content, canApplyMultiple, post, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)'
        const [eventRow, eventField] = await newDB.execute(eventQuery, [eventData.title, content, eventData.canApplyMultiple, postId, now, now])

        const needManual = [];
        const promises = [];

        registrations.forEach(async registration => {
            const promise = new Promise(async (resolve, reject) => {
                const registrationData = registration.data();
                if (registrationData.userData) {
                    const userData = JSON.parse(registrationData.userData);
                    console.log("Processing:" + userData.email);
                    const authorQuery = 'SELECT * FROM `Users` WHERE `email` = ?';
                    const [authorRows, authorFields] = await newDB.execute(authorQuery, [userData.email]);
                    const author = authorRows[0];
                    if (author) {
                        //MIGRATE EVENT REGISTRATION
                        const eventRegistrationQuery = 'INSERT INTO EventRegistrations(event, user, response, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)'
                        const [eventRegistrationRows, eventRegistrationFields] = await newDB.execute(eventRegistrationQuery, [eventRow.insertId, author.id, registrationData.responseData, now, now]);
                        console.log("Done: " + userData.email);
                        resolve()
                    }
                    else {
                        needManual.push({
                            email: userData.email,
                            event: eventData.title
                        })
                        console.log("Failed: " + userData.email)
                        resolve();
                    }
                }
            })
            promises.push(promise)
        })
        await Promise.all(promises).then(async (results) => {
            console.log(promises.length);
            console.log("These need manual migration: ");
            console.log(needManual);
        })
    })

}

await main();

import { dbService, authService, storageService } from "../firebaseFunctions.js"
import mysql from "mysql2/promise"
import admin from "firebase-admin";
import { applicationDefault } from "firebase-admin/app";

async function main() {
    const newDB = await mysql.createConnection({
        host: process.env.DBIP,
        user: process.env.PKR_VAR_MYSQL_USER,
        password: process.env.PKR_VAR_MYSQL_PASSWORD,
        database: process.env.PKR_VAR_MYSQL_DATABASE
    })
    await authService.signInWithEmailAndPassword(process.env.FIREBASE_EMAIL_ID, process.env.FIREBASE_PASSWORD);
    await migrateUsers(newDB);
}

function processProfile(profile) {
    return {
        username: profile.username ? profile.username : null,
        email: profile.email ? profile.email : null,
        yob: profile.yob ? profile.yob : null,
        gender: profile.gender ? profile.gender : null,
        enrolledYear: profile.enrolledYear ? profile.enrolledYear : null,
        major: profile.major ? profile.major : null,
        KTId: profile.KTId ? profile.KTId : null,
        isVerified: profile.isVerified ? profile.isVerified : false,
        profilePictureURL: profile.profilePictureURL ? profile.profilePictureURL : null,
        role: profile.role ? profile.role : null,
        verificationURL: profile.acceptanceLetterURL ? profile.acceptanceLetterURL : profile.graduationDocumentURL ? profile.graduationDocumentURL : null,
    }
}

async function migrateUsers(newDB) {
    const userDocs = await dbService.collection("users").get();
    const adminService = admin.initializeApp({
        credential: applicationDefault(),
    })
    //TODO: GET ROLES FROM DATABASE AND CLASSIFY TO EACH USER

    const roleMap = {
        "Current": 1,
        "Offered": 2,
        "Graduated": 3,
        "Registered": 4,
        "Admin": 5,
    }

    const needManual = [];
    const promises = [];

    userDocs.forEach(async userDoc => {
        const promise = new Promise(async (resolve, reject) => {
            let data = userDoc.data();
            console.log("Processing " + data.username);
            let doInsert = true;
            const userData = await adminService.auth().getUserByEmail(data.email).catch(err => {
                needManual.push(data);
                doInsert = false;
            });
            if (!doInsert) {
                resolve("Failed to fetch from admin system" + data.username)
                return;
            }
            const emailVerified = userData.emailVerified;
            data = processProfile(data);
            const now = new Date()
            const userQuery = 'INSERT INTO Users(name, yearOfBirth, gender, enrolledYear, email, major, kakaoTalkId, verified, emailVerified, profileImageUrl, role, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            const [userExecutedRows, userExecutedFields] = await newDB.execute(userQuery, [data.username, data.yob, data.gender, data.enrolledYear, data.email, data.major, data.KTId, data.isVerified, emailVerified, data.profilePictureURL, roleMap[data.role], now, now]);
            if (data.verificationURL && ! data.isVerified) {
                const verificationQuery = "INSERT INTO Verifications(user, fileUrl, createdAt, updatedAt) VALUES(?, ?, ?, ?)"
                const [verExecutedRows, verExecutedFields] = await newDB.execute(verificationQuery, [userExecutedRows.insertId, data.verificationURL, now, now])
                console.log("Done " + data.username)
            }
            resolve("Done: " + data.username);
        })
        promises.push(promise);
    })

    await Promise.all(promises).then(result => {
        console.log("These are users that need manual migration:")
        console.log(needManual)
        newDB.destroy();
        process.exit()
    })

}

await main();
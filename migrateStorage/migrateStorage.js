import { dbService, authService, storageService } from "../firebaseFunctions.js"
import AWS from 'aws-sdk'
import { storage } from "firebase-admin"

AWS.config.update({
    region: "ap-southeast-1"
})

const uploadParams = {
    Bucket: "nuskusa-storage",
    Key: "",
    Body: "",
}

storageService
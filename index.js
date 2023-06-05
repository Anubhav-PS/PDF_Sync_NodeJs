const {logger} = require("firebase-functions");

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sendGrid = require("@sendgrid/mail");
const serviceAccount = require("./serviceAccountKey.json");
const {setGlobalOptions} = require("firebase-functions/v2");


//Initialization of firebase
admin.initializeApp({
    // @ts-ignore
    credential: admin.credential.cert(serviceAccount),
    projectId: 'your_project_id',
});


//Send Grid Api Key
const sendAPI_KEY = "your_send_grid_key";
sendGrid.setApiKey(sendAPI_KEY);


setGlobalOptions({maxInstances: 10});


//########################################################################################################################################################################
//########################################################################################################################################################################
//########################################################################################################################################################################
//                                                                              PDF SYNC
//                                                                         The Code Starts Here
//########################################################################################################################################################################
//########################################################################################################################################################################
//########################################################################################################################################################################


//checks if the username is available or not (returns -> true/false)
exports.isUsernameAvailable = functions.https.onCall(async (data, context) => {
    // ...

    if (!context.auth) {
        // Throwing an HttpsError so that the client gets the error details.
        throw new functions.https.HttpsError("failed-precondition", "Request From Unauthenticated Client");
    }

    //get the username passed by client to check availability
    const username = data.username;

    //locate the document
    const usernameDocPath = admin.firestore().collection("/USERNAMES/").doc(username);
    const usernameDocRef = await usernameDocPath.get();

    //return true if username exist or false if it does not exist
    const exists = usernameDocRef.exists;

    return {
        username: exists
    };


});


//checks if username exists , if exists it returns mail id associated with it (return -> mailId/NULL)
exports.getMailId = functions.https.onRequest(async (request, response) => {

    const username = request.query.username || null;

    if (username == null) {
        response.status(510).send("INVALID");
        return;
    }

    //locate the document
    const usernameDocPath = admin.firestore().collection("USERNAMES").doc(username.toString());
    const usernameDocRef = await usernameDocPath.get();

    let value;

    if (usernameDocRef.exists) {

        //document with username exist
        //get the user ID stored
        //use the user ID to fetch the usermailId
        // @ts-ignore
        const user_UID = usernameDocRef.data().user_UID;
        const userRecord = await admin.auth().getUser(user_UID);

        const mailId = userRecord.email;
        value = mailId;


    } else {

        //no such document exists
        //return null

        value = "null";

    }


    response.status(210).send(value);

});


//gets the usermail id ,user id and name associated with the username if it exists (return -> userdetails/false)
exports.getUserDetails = functions.https.onCall(async (data, context) => {
    // ...

    if (!context.auth) {
        // Throwing an HttpsError so that the client gets the error details.
        throw new functions.https.HttpsError("failed-precondition", "Request From Unauthenticated Client");
    }

    //get the username passed by client to check availability
    const username = data.username;

    //locate the document
    const usernameDocPath = admin.firestore().collection("/USERNAMES/").doc(username);
    const usernameDocRef = await usernameDocPath.get();


    if (!usernameDocRef.exists) {
        //return null
        return {
            status: false
        };

    }


    //document with username exist
    //get the user ID stored
    //use the user ID to fetch the usermailId
    // @ts-ignore
    const user_UID_ = usernameDocRef.data().user_UID;
    const userRecord = await admin.auth().getUser(user_UID_);

    const mailId_ = userRecord.email;

    const userRecordPath = admin.firestore().collection("/USERS/").doc(user_UID_);
    const userRecordDocRef = await userRecordPath.get();


    if (!userRecordDocRef.exists) {
        //return null
        return {
            status: false
        };

    }

    // @ts-ignore
    const name_ = userRecordDocRef.data().name;

    return {
        status: true,
        mailId: mailId_,
        name: name_,
        user_UID: user_UID_
    };


});


//give the invitee access to the PDF
exports.shareWithUser = functions.https.onCall(async (data, context) => {
    // ...

    if (!context.auth) {
        // Throwing an HttpsError so that the client gets the error details.
        throw new functions.https.HttpsError("failed-precondition", "Request From Unauthenticated Client");
    }

    //get the user details
    const invitee_user_UID = data.user_UID;
    const invitee_name = data.name;
    const invitee_username = data.username;
    const invitee_mailID = data.mailId;
    const invitee_message = data.message;

    //get the pdf details
    const name_ = data.senderName;
    const filename_ = data.filename;
    const documentId_ = data.documentId;
    const size_ = data.size;
    const uploadedOn_ = data.uploadedOn;
    const url_ = data.url;

    const commentsId_ = documentId_;
    const recycleBin_ = false;
    const sharing_ = "RESTRICTED";
    const starred_ = false;


    //add pdf file to the invitee's folder
    //check if its already added

    //locate the document
    const pdfDocPath = admin.firestore().collection("/SHARED_WITH_ME/").doc(invitee_user_UID).collection("FILES").doc(documentId_);
    const pdfDocRef = await pdfDocPath.get();

    if (pdfDocRef.exists) {

        return {
            status: false,
            response: "PDF Is Already Shared With The User"
        };

    }


    const PDF = {
        //get the pdf details
        commentsId: commentsId_,
        documentId: documentId_,
        filename: filename_,
        name: name_,
        recycleBin: recycleBin_,
        sharing: sharing_,
        size: size_,
        starred: starred_,
        uploadedOn: uploadedOn_,
        url: url_,

    }


    await pdfDocPath.create(PDF)
        .catch((error) => {
            return {
                status: false,
                response: error.message
            };
        });


    //add user to shared contact list

    const sharedWith = {
        user_UID: invitee_user_UID,
        name: invitee_name,
        username: invitee_username,
        mailId: invitee_mailID,
    }

    await admin.firestore().collection("/SHARED_CONTACTS/")
        .doc(documentId_).collection("CONTACTS")
        .doc(invitee_user_UID).create(sharedWith);


    ///PDF/THMGJeuVtFhgKWGsLx0tiFGpI1D3/FILES/5UnBpOGeivD2xNw9NImh
    //set the field "sharing" to "RESTRICTED" in the user sharing the PDF

    const user_UID = context.auth.uid;

    await admin.firestore().collection("/PDF/")
        .doc(user_UID).collection("FILES")
        .doc(documentId_).update({
            sharing: sharing_,
        });


    //send mail
    const templateId_ = "d-31140d9dd8434e79988578a0893fd7b9";
    const userMailId = context.auth.token.email;

    const megabytes = size_ / (1024 * 1024);
    const fileSize = megabytes + " MB";

    //initialise a mail content JSON
    const mailContentJSON = {

        to: invitee_mailID,
        from: {
            name: "PDF SYNC",
            email: "fecent.bytes@gmail.com",
        },
        templateId: templateId_,
        dynamic_template_data: {
            inviteeName: invitee_name,
            filename: filename_,
            size: fileSize,
            name: name_,
            mailId: userMailId,
            message: invitee_message,
        },
    };

    //wait untill the mail is sent sucessfully
    await sendGrid.send(mailContentJSON);


    //send fcm notification

    //get the fcm details of the invitee
    const fcmTokenDocPath = admin.firestore().collection("/FCM/").doc(invitee_user_UID);

    const fcmTokenDocRef = await fcmTokenDocPath.get();

    if (fcmTokenDocRef.exists) {

        const fcmTokenObject = fcmTokenDocRef.data();

        // @ts-ignore
        const fcmToken = fcmTokenObject.fcmToken;

        const titleMessage_ = name_ + " has shared a PDF with you";
        const body_ = filename_ + " ,PDF was shared to you.Open the app to view the PDF";

        const payload = {
            notification: {
                title: titleMessage_,
                body: body_,
            },
            token: fcmToken,
        };

        await admin.messaging().send(payload);

    }

    //send response back

    const responseMessage = "Shared The PDF With " + invitee_name;

    return {
        status: true,
        response: responseMessage
    };


});


//creates the user record with the details in the username document
exports.onUserNameDocumentCreated = functions.firestore.document("/USERNAMES/{docID}")
    .onCreate(async (snapshot, context) => {


        //get the data from the snapshot
        const usernameObject = snapshot.data();

        const user_ID = usernameObject.user_UID;

        const userAuth = await admin.auth().getUser(user_ID);

        const mail_ID = userAuth.email;

        const userRecord = {
            user_UID: user_ID,
            mailId: mail_ID,
            username: snapshot.id,
            name: snapshot.id,
            contactNumber: "",
            fcmToken: "",
            avatar: 0,
        };


        //create user record
        await admin.firestore().collection("USERS/").doc(user_ID).set(userRecord);

        //send mail welcome mail


        //send mail
        const templateId_ = "d-a862305d41834e5b994a07698f67b5e1";
        const userMailId = mail_ID;

        //initialise a mail content JSON
        const mailContentJSON = {
            to: mail_ID,
            from: {
                name: "PDF SYNC",
                email: "fecent.bytes@gmail.com",
            },
            templateId: templateId_,
            dynamic_template_data: {
                username: snapshot.id,
            },
        };

        //wait untill the mail is sent sucessfully
        await sendGrid.send(mailContentJSON);

        return;
    });


//########################################################################################################################################################################
//########################################################################################################################################################################
//########################################################################################################################################################################
//                                                                              PDF SYNC
//                                                                         The Code Ends Here
//########################################################################################################################################################################
//########################################################################################################################################################################
//########################################################################################################################################################################








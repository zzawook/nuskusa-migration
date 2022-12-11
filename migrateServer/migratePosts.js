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
        await migratePosts(newDB);
    });
}

function processPost(post) {
    return {
        title: post.title ? post.title : "",
        content: post.content ? post.content : "",
        isAnnouncement: post.isAnnouncement ? post.isAnnouncement : false,
        isHidden: post.isHidden ? post.isHidden : false,
        isAnonymous: post.isAnonymous ? post.isAnonymous : false,
        isPinned: post.isPinned ? post.isPinned : false,
        isEvent: post.isEvent ? post.isEvent : false,
        authorId: post.authorId,
        upvoteArray: post.upvoteArray ? post.upvoteArray : [],
    }
}

function processAuthor(author) {
    return {
        id: author.id ? author.id : null,
    }
}

function processBoard(board) {
    return {
        id: board.id ? board.id : null
    }
}

async function migratePosts(newDB) {
    const now = new Date();
    const boards = await dbService.collection("boards").get();
    boards.forEach(async board => {
        const boardQuery = 'SELECT * FROM `Boards` WHERE `boardId` = ?'
        const [rows, fields] = await newDB.execute(boardQuery, [board.id]);
        const boardData = processBoard(rows[0]);

        //MIGRATE POSTS IN EACH BOARD
        const posts = await dbService.collection("boards").doc(board.id).collection("posts").get();
        posts.forEach(async post => {
            //MIGRATE POST
            const data = processPost(post.data());
            console.log("Adding post: " + data.title);
            const authorDoc = await dbService.collection("users").doc(data.authorId).get();
            const authorData = authorDoc.data();
            const authorQuery = 'SELECT * FROM `Users` WHERE `email` = ?';
            const [authorRows, authorFields] = await newDB.execute(authorQuery, [authorData.email]);
            let author = authorRows[0];
            author = processAuthor(author)
            const postQuery = 'INSERT INTO Posts(author, board, title, content, isAnnouncement, isAnonymous, isHidden, isPinned, isEvent, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            const [executedRows, executedFields] = await newDB.execute(postQuery, [author.id, boardData.id, data.title, data.content, data.isAnnouncement, data.isAnonymous, data.isHidden, data.isPinned, data.isEvent, now, now])
            const postId = executedRows.insertId;

            if (data.upvoteArray.length > 0) {
                for (let i = 0; i < data.upvoteArray.length; i++) {
                    const getUpvoteUser = await data.upvoteArray[i].get();
                    const upvoteUser = getUpvoteUser.data();
                    if (upvoteUser) {
                        const upvoteUserQuery = 'SELECT * FROM `Users` WHERE `email` = ?';
                        const [upvoteUserRows, upvoteUserFields] = await newDB.execute(upvoteUserQuery, [upvoteUser.email]);
                        const upvoteUserId = upvoteUserRows[0].id;
                        const upvoteQuery = 'INSERT INTO PostUpvotes(author, post, createdAt, updatedAt) VALUES(?, ?, ?, ?)'
                        const [upvoteRows, upvoteFields] = await newDB.execute(upvoteQuery, [upvoteUserId, postId, now, now]);
                        console.log("Done post: " + data.title);
                    }
                }
            }

            //MIGRATE COMMENTS
            const commentDocs = await dbService.collection("boards").doc(board.id).collection("posts").doc(post.id).collection("comments").get();
            if (!commentDocs.empty) {
                const comments = [];
                const commentIds = [];
                commentDocs.forEach(async commentDoc => {
                    const commentData = commentDoc.data();
                    if (!commentData.isReply) {
                        await addComment(commentData, postId);
                    }
                    else {
                        comments.push(commentDoc.data());
                        commentIds.push(commentDoc.id)
                    }
                })
                while (comments.length > 0) {
                    for (let i = 0; i < comments.length; i++) {
                        const commentData = comments[i];
                        if (!commentIds.includes(commentData.replyTo)) {
                            promises.push(addComment(commentData, postId));
                            comments.splice(i, 1);
                            commentIds.splice(i, 1);
                        }
                    }
                }
            }
        })
    })

    async function addComment(commentData, postId) {
        console.log("Adding comment: " + commentData.content)
        const authorDoc = await dbService.collection("users").doc(commentData.authorId).get();
        const authorData = authorDoc.data();
        const authorQuery = 'SELECT * FROM `Users` WHERE `email` = ?';
        const [authorRows, authorFields] = await newDB.execute(authorQuery, [authorData.email]);
        const author = authorRows[0];
        const commentQuery = 'INSERT INTO Comments(author, post, content, replyTo, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)'
        const [commentRows, commentFields] = await newDB.execute(commentQuery, [author.id, postId, commentData.content, commentData.replyTo, now, now]);
        const commentId = commentRows.insertId;

        if (commentData.upvoteArray.length > 0) {
            for (let i = 0; i < commentData.upvoteArray.length; i++) {
                const getUpvoteUser = await commentData.upvoteArray[i].get();
                const upvoteUser = getUpvoteUser.data();
                if (upvoteUser) {
                    const upvoteUserQuery = 'SELECT * FROM `Users` WHERE `email` = ?';
                    const [upvoteUserRows, upvoteUserFields] = await newDB.execute(upvoteUserQuery, [upvoteUser.email]);
                    const upvoteUserId = upvoteUserRows[0].id;
                    const upvoteQuery = 'INSERT INTO CommentUpvotes(author, comment, createdAt, updatedAt) VALUES(?, ?, ?, ?)'
                    const [upvoteRows, upvoteFields] = await newDB.execute(upvoteQuery, [upvoteUserId, commentId, now, now]);
                }
            }
        }
        console.log("Done comment: " + commentData.content)
        return;
    }
}

await main()
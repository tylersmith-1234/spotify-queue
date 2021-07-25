const mongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path')
const creds = fs.existsSync(path.join(__dirname, './credentials.json')) ? './credentials.json' : './guestCredentials.json';
const { username, password } = require(`${creds}`);
const mongoDbUrl = `mongodb+srv://${username}:${password}@spotify-queue.1i1l0.mongodb.net?retryWrites=true&w=majority`;
let mongodb;
function connect(callback){
    mongoClient.connect(mongoDbUrl, (err, db) => {
        if (err) console.error(err);
        mongodb = db;
        callback();
    });
}
function get(dbName){
    return mongodb.db(dbName || 'admin');
}

function close(){
    mongodb.close();
}

module.exports = {
    connect,
    get,
    close
};
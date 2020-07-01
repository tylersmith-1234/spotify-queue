const mongoClient = require('mongodb').MongoClient;
const mongoDbUrl = 'mongodb://127.0.0.1:27017';
let mongodb;

function connect(callback){
    mongoClient.connect(mongoDbUrl, (err, db) => {
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
const mongoClient = require('mongodb').MongoClient;
const mongoDbUrl = 'mongodb+srv://tyler:bus402@spotify-queue.1i1l0.mongodb.net?retryWrites=true&w=majority';
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
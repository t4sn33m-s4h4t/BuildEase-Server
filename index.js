const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, { useUnifiedTopology: true });

async function run() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const database = client.db('buildingManagement');
        const usersCollection = database.collection('users');
        const apartmentsCollection = database.collection('apartments');
        const agreementsCollection = database.collection('agreements');
        const couponsCollection = database.collection('coupons');
        const announcementsCollection = database.collection('announcements');

        // Routes

        // Home route
        app.get('/', (req, res) => {
            res.send('Building Management System API is running!');
        });

        
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

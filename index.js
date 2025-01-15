const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

const generateToken = (payload) => {
    const secret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || '50d';
    return jwt.sign(payload, secret, { expiresIn });
};

const authenticateUser = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: Token is missing' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
};

const verifyEmail = (req, res, next) => {
    const providedEmail = req.body.email || req.params.email || req.query.email;
    if (req.user.email !== providedEmail) {
        return res.status(403).json({ message: 'Forbidden: Email mismatch' });
    }
    next();
};

const verifyAdmin = (req, res, next) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
    next();
};

// Home route
app.get('/', (req, res) => {
    res.send('Building Management System API is running!');
});

// JWT 
app.post('/jwt', (req, res) => {
    const user = req.body;
    const token = generateToken(user);
    res.send({ success: true, token });
});

// User Routes
app.put('/register', async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name || !email) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        const result = await usersCollection.updateOne(
            { email },
            { $set: { name, email } },
            { upsert: true }
        );

        if (result.matchedCount > 0 || result.upsertedCount > 0) {
            const token = generateToken({ email });
            res.status(200).json({ message: "User created successfully", token });
        } else {
            res.status(500).json({ message: "Unexpected result from the operation" });
        }
    } catch (err) {
        console.error('User creation failed:', err);
        res.status(500).json({ message: 'User creation failed' });
    }
});


run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

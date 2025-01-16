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

let usersCollection, apartmentsCollection, agreementsCollection, couponsCollection, announcementsCollection;

async function run() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const database = client.db('BuildEase');
        usersCollection = database.collection('users');
        apartmentsCollection = database.collection('apartments');
        agreementsCollection = database.collection('agreements');
        couponsCollection = database.collection('coupons');
        announcementsCollection = database.collection('announcements');
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

// Apartments Routes
app.get('/apartments', async (req, res) => {
    const { page = 1, limit = 6, minRent, maxRent } = req.query;
    const query = {};
    console.log(req.query)
    if (minRent && maxRent) {
        query.rent = { $gte: parseInt(minRent), $lte: parseInt(maxRent) };
    }

    const options = {
        skip: (page - 1) * limit,
        limit: parseInt(limit),
    };

    const count = await apartmentsCollection.countDocuments(query);
    const apartments = await apartmentsCollection.find(query, options).toArray();
    res.send({ apartments, count });
});

app.get('/apartment/:id', async (req, res) => {
    const {id} = req.params
    const apartment = await apartmentsCollection.findOne({_id: new ObjectId(id)});
    res.send({ apartment });
});



app.post('/apartments/agreement', async (req, res) => {
    const agreement = req.body;
    const existingAgreement = await agreementsCollection.findOne({
        userId: agreement.userId,
    });
    if (existingAgreement) {
        return res.status(400).send({ message: 'You Have Already Applied' });
    }

    agreement.status = 'pending';
    const result = await agreementsCollection.insertOne(agreement);
    res.send(result);
});

//Agreement Route
app.get('/agreement/:userEmail', async (req, res) => {
    try {
        const { userEmail } = req.params; 
        const agreement = await agreementsCollection.findOne({ userEmail, role: 'member'});
        if (agreement) {
            res.status(200).send({ agreement });
        } else {
            res.status(404).send({ message: 'Agreement not found' });
        }
    } catch (error) {
        console.error('Error fetching agreement:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Coupons Routes
app.get('/coupons', async (req, res) => {
    const coupons = await couponsCollection.find({}).toArray();
    res.send(coupons);
});

app.post('/coupons', async (req, res) => {
    const coupon = req.body;
    const result = await couponsCollection.insertOne(coupon);
    res.send(result);
});



// Announcements Routes
app.get('/announcements', async (req, res) => {
    const announcements = await announcementsCollection.find({}).toArray();
    res.send(announcements);
});

app.post('/announcements', async (req, res) => {
    const announcement = req.body;
    const result = await announcementsCollection.insertOne(announcement);
    res.send(result);
});


// Admin Routes
app.get('/admin/members', async (req, res) => {
    const members = await usersCollection.find({ role: 'member' }).toArray();
    res.send(members);
});

app.patch('/admin/members/:id', async (req, res) => {
    const { id } = req.params;
    const update = { $set: { role: 'user' } };
    const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, update);
    res.send(result);
});

app.post('/admin/accept-agreement', async (req, res) => {
    const { agreementId } = req.body;
    const result = await agreementsCollection.updateOne(
        { _id: new ObjectId(agreementId) },
        { $set: { status: 'accepted' } }
    );
    res.send(result);
});

app.post('/admin/reject-agreement', async (req, res) => {
    const { agreementId } = req.body;
    const result = await agreementsCollection.updateOne(
        { _id: new ObjectId(agreementId) },
        { $set: { status: 'rejected' } }
    );
    res.send(result);
});

// Payment History Routes
app.post('/payments', async (req, res) => {
    const payment = req.body;
    const result = await agreementsCollection.updateOne(
        { userId: payment.userId, apartmentId: payment.apartmentId },
        { $push: { payments: payment } }
    );
    res.send(result);
});

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

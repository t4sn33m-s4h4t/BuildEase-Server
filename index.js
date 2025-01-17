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
    
    if (!token) return res.status(401).json({ message: 'Unauthorized Access. Login First' });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
};

const verifyEmail = (req, res, next) => {
    const email = req.body.email || req.params.email || req.query.email;
    if (req.user.email !== email) return res.status(403).json({ message: 'Email mismatch' });
    next();
};

const verifyAdmin = (req, res, next) => {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    next();
};

app.get('/', (req, res) => res.send('Building Management System API is running'));

app.post('/jwt', (req, res) => {
    const token = generateToken(req.body);
    res.json({ success: true, token });
});

app.put('/register', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Missing required fields' });

    try {
        const result = await usersCollection.updateOne({ email }, { $set: { name, email, role: 'user' } }, { upsert: true });
        const token = generateToken({ email });
        res.status(200).json({ message: 'User registered', token });
    } catch {
        res.status(500).json({ message: 'Registration failed' });
    }
});

app.get('/users',authenticateUser, async (req, res) => {
    try {
        const users = await usersCollection.find({ role: "member" }).toArray();
        res.json({ users });
    } catch {
        res.status(500).json({ message: 'Failed to fetch users' });
    }
});

app.put('/users/:userEmail', authenticateUser, async (req, res) => {
    const { userEmail } = req.params;
    try {
        const updatedUser = await usersCollection.updateOne(
            { email: userEmail },
            { $set: { role: 'pending' } }
        );

        if (updatedUser.matchedCount > 0) {
            const deleteResult = await agreementsCollection.deleteMany({
                userEmail: userEmail,
                status: 'checked',
            });

            if (deleteResult.deletedCount > 0) {
                console.log('Deleted agreements:', deleteResult.deletedCount);
            }
        }

        console.log(updatedUser.matchedCount, userEmail);
        res.json({ message: 'Member Removed Successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Failed to Remove User' });
    }
});

app.get('/stats', authenticateUser, async (req, res) =>{
    try {
        const totalRooms = await apartmentsCollection.countDocuments();
        const users = await usersCollection.countDocuments();
        const members = await usersCollection.countDocuments({role: 'member'});
        res.json({ 
            totalRooms,
            availableRooms: totalRooms-members,
            users,
            members
        });
    } catch {
        res.status(500).json({ message: 'Failed to fetch apartments' });
    }
})

app.get('/apartments', async (req, res) => {
    const { page = 1, limit = 6, minRent, maxRent } = req.query;
    const query = minRent && maxRent ? { rent: { $gte: +minRent, $lte: +maxRent } } : {};

    try {
        const options = { skip: (page - 1) * limit, limit: +limit };
        const count = await apartmentsCollection.countDocuments(query);
        const apartments = await apartmentsCollection.find(query, options).toArray();
        res.json({ apartments, count });
    } catch {
        res.status(500).json({ message: 'Failed to fetch apartments' });
    }
});

app.get('/apartment/:id', async (req, res) => {
    try {
        const apartment = await apartmentsCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.json({ apartment });
    } catch {
        res.status(404).json({ message: 'Apartment not found' });
    }
});

app.post('/apartments/agreement', authenticateUser, async (req, res) => {
    const agreement = {
        ...req.body,
        status: 'pending',
        requestDate: new Date().toISOString()
    };

    try {
        const isMember = await usersCollection.findOne({role: 'member', email: agreement.userEmail});
        if (isMember) {
            return res.status(400).json({message: 'You are Already a Member'})
        }
        const existingAgreement = await agreementsCollection.findOne({ userEmail: agreement.userEmail , status: 'pending'});
        if (existingAgreement) {
            return res.status(400).json({ message: 'You Have Already Applied' });
        }

        const result = await agreementsCollection.insertOne(agreement);
        res.json(result);
    } catch {
        res.status(500).json({ message: 'Failed to create agreement' });
    }
});

app.get('/agreements', async (req, res) => {
    try {
        const agreements = await agreementsCollection.find({ status: "pending" }).toArray();
        res.json({ agreements });
    } catch {
        res.status(500).json({ message: 'Failed to fetch agreements' });
    }
});


app.get('/agreement/:userEmail', authenticateUser, async (req, res) => {

    try {
        const agreement = await agreementsCollection.findOne({ userEmail: req.params.userEmail });
        if (agreement) return res.json({ agreement });

        res.status(404).json({ message: 'Agreement not found' });
    } catch {
        res.status(500).json({ message: 'Internal server error' });
    }
});


app.put('/agreement/:id', authenticateUser, async (req, res) => {
    const { action } = req.body
    const { id } = req.params
    try {
        const agreement = await agreementsCollection.findOne({ _id: new ObjectId(id) });
        if (!agreement) {
            return res.status(404).json({ message: 'Agreement not found' });
        }
        const updatedAgreement = await agreementsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: 'checked',
                }
            }
        );
        if (action === 'accept') {
            const updatedUser = await usersCollection.updateOne(
                { email: agreement.userEmail },
                { $set: { role: 'member' } }
            )
            if (updatedUser.matchedCount === 0) {
                return res.status(404).json({ message: 'User not found' });
            }
        }
        res.json({ message: `Agreement ${action === 'accept' ? 'accepted' : 'rejected'} successfully` });
    } catch {
        res.status(500).json({ message: 'Failed to update agreement status' });
    }
});


app.get('/announcements', async (req, res) => {
    const announcements = await announcementsCollection.find({}).toArray();
    res.send(announcements.reverse());
});

app.post('/announcements', authenticateUser, async (req, res) => {
    const announcement = req.body;
    const result = await announcementsCollection.insertOne(announcement);
    res.send(result);
});

app.get('/coupons', async (req, res) => {
    try {
        const coupons = await couponsCollection.find().toArray();
        res.json(coupons);
    } catch {
        res.status(500).json({ message: 'Failed to fetch coupons' });
    }
});

app.post('/coupons', authenticateUser, async (req, res) => {
    try {
        const result = await couponsCollection.insertOne(req.body);
        res.json(result);
    } catch {
        res.status(500).json({ message: 'Failed to add coupon' });
    }
});

app.delete('/coupon/:id', authenticateUser, async (req, res) => {
    try {
        const result = await couponsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount) res.json({ success: true });
        else res.status(404).json({ message: 'Coupon not found' });
    } catch {
        res.status(500).json({ message: 'Failed to delete coupon' });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));

run().catch(console.dir);

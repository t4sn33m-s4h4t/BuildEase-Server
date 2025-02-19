require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.mongoDBUserName}:${process.env.mongoDBPass}@buildease.q8k7c.mongodb.net/?retryWrites=true&w=majority&appName=BuildEase`

const client = new MongoClient(uri, { useUnifiedTopology: true });

let usersCollection, apartmentsCollection, agreementsCollection, couponsCollection, announcementsCollection, paymentsCollection;

async function run() {
    try {
        
        const database = client.db('BuildEase');
        usersCollection = database.collection('users');
        apartmentsCollection = database.collection('apartments');
        agreementsCollection = database.collection('agreements');
        couponsCollection = database.collection('coupons');
        announcementsCollection = database.collection('announcements');
        paymentsCollection = database.collection('payments');
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
    const email = req.query.email || req.body.userEmail;
    if (req.user.email !== email) return res.status(403).json({ message: 'Email Mismatched.' });

    next();
};

const verifyAdmin = async (req, res, next) => {
    const user = await usersCollection.findOne({ email: req.user.email });
    if (!(user?.role === 'admin')) return res.status(403).json({ message: 'Admin access required' });
    next();
};

app.get('/', (req, res) => res.send('Building Management System API is running'));


app.post('/jwt', (req, res) => {
    const token = generateToken(req.body);
    res.status(200).json({ message: 'User registered', token });
});

app.put('/register', async (req, res) => {
    const { name, email } = req.body;
    try {
        const user = await usersCollection.findOne({ email });
        if (!user?.role) {
            await usersCollection.updateOne(
                { email },
                { $set: { name, email, role: 'user' } },
                { upsert: true }
            );
        }
        const token = generateToken({ email });
        res.status(200).json({ message: 'User registered', token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

app.get('/users', authenticateUser, verifyAdmin, async (req, res) => {
    try {
        const users = await usersCollection.find({ role: "member" }).toArray();
        res.json({ users });
    } catch {
        res.status(500).json({ message: 'Failed to fetch users' });
    }
});

app.put('/users/:email', authenticateUser, verifyAdmin, async (req, res) => {
    const { email } = req.params;
    try {
        const updatedUser = await usersCollection.updateOne(
            { email: email },
            { $set: { role: 'user' } }
        );

        if (updatedUser.matchedCount > 0) {
            const deleteResult = await agreementsCollection.deleteMany({
                userEmail: email,
                status: 'checked',
            });
        }
        res.json({ message: 'Member Removed Successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Failed to Remove User' });
    }
});

app.get('/stats', authenticateUser, verifyAdmin, async (req, res) => {
    try {
        const totalRooms = await apartmentsCollection.countDocuments();
        const users = await usersCollection.countDocuments();
        const members = await usersCollection.countDocuments({ role: 'member' });
        const Admins = await usersCollection.countDocuments({ role: 'admin' });
        res.json({
            totalRooms,
            availableRooms: totalRooms - members,
            users: users - members - Admins,
            members
        });
    } catch {
        res.status(500).json({ message: 'Failed to fetch apartments' });
    }
})

app.get('/apartments', async (req, res) => {
    const { 
        page = 1, 
        limit = 8, 
        minRent, 
        maxRent, 
        sortRent  
    } = req.query;
    
    const query = minRent && maxRent 
    ? { rent: { $gte: +minRent, $lte: +maxRent } } 
    : {};
    
    try {
        
        const sortOption = sortRent === 'asc' 
        ? { rent: 1 }   
        : sortRent === 'desc' 
        ? { rent: -1 }  
        : {};           
        
        const options = { 
            skip: (page - 1) * limit, 
            limit: +limit,
            sort: sortOption 
        };
        
        const count = await apartmentsCollection.countDocuments(query);
        const apartments = await apartmentsCollection.find(query, options).toArray();
   
        
        res.json({ 
            apartments, 
            count,
            sortOrder: sortRent || 'default'  
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({ 
            message: 'Failed to fetch apartments', 
            error: error.message 
        });
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

app.post('/apartments/agreement', authenticateUser, verifyEmail, async (req, res) => {
    const user = await usersCollection.findOne({ email: req.user.email });
    if ((user?.role === 'admin')) return res.status(409).json({ message: 'Admin Cannot Make Agreements' });
    const agreement = {
        ...req.body,
        status: 'pending',
        requestDate: new Date().toISOString()
    };

    try {
        const isMember = await usersCollection.findOne({ role: 'member', email: agreement.userEmail });
        if (isMember) {
            return res.status(400).json({ message: 'You are Already a Member' })
        }
        const existingAgreement = await agreementsCollection.findOne({ userEmail: agreement.userEmail, status: 'pending' });
        if (existingAgreement) {
            return res.status(400).json({ message: 'You Have Already Applied' });
        }

        const result = await agreementsCollection.insertOne(agreement);
        res.json(result);
    } catch {
        res.status(500).json({ message: 'Failed to create agreement' });
    }
});

app.get('/agreements', authenticateUser, verifyAdmin, async (req, res) => {
    try {
        const agreements = await agreementsCollection.find({ status: "pending" }).toArray();
        res.json({ agreements });
    } catch {
        res.status(500).json({ message: 'Failed to fetch agreements' });
    }
});

app.get('/agreement/:userEmail', authenticateUser, verifyEmail, async (req, res) => {
    try {
        const agreement = await agreementsCollection.findOne({ userEmail: req.params.userEmail, status: 'checked' });
        if (agreement) return res.json({ agreement });
        res.status(404).json({ message: 'Agreement not found' });
    } catch {
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.put('/agreement/:id', authenticateUser, verifyAdmin, async (req, res) => {
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

app.get('/announcements', authenticateUser, async (req, res) => {
    const announcements = await announcementsCollection.find({}).toArray();
    res.send(announcements.reverse());
});

app.post('/announcements', authenticateUser, verifyAdmin, async (req, res) => {
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

app.post('/coupons', authenticateUser, verifyAdmin, async (req, res) => {
    try {
        const result = await couponsCollection.insertOne(req.body);
        res.json(result);
    } catch {
        res.status(500).json({ message: 'Failed to add coupon' });
    }
});

app.delete('/coupon/:id', authenticateUser, verifyAdmin, async (req, res) => {
    try {
        const result = await couponsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount) res.json({ success: true });
        else res.status(404).json({ message: 'Coupon not found' });
    } catch {
        res.status(500).json({ message: 'Failed to delete coupon' });
    }
});

app.patch('/coupon/:id', authenticateUser, verifyAdmin, async (req, res) => {
    try {
        const result = await couponsCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { expired: true } }      
        );
        if (result.matchedCount) {
            res.json({ success: true, message: 'Coupon updated successfully' });
        } else {
            res.status(404).json({ message: 'Coupon not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to update coupon', error: error.message });
    }
});


app.get("/userRole", authenticateUser, async (req, res) => {
    const user = await usersCollection.findOne({ email: req.user.email });
    const userRole = user?.role;
    res.status(200).json({ userRole });
})


app.get('/payment-history', authenticateUser, async (req, res) => {
    try {
        const payments = await paymentsCollection.find({ email: req.user.email }).toArray();
        res.send(payments);
    } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Failed to fetch payment history." });
    }
});


app.post('/payment-history', authenticateUser, async (req, res) => {
    try {
        const payment = req.body;
        const result = await paymentsCollection.insertOne(payment);
        res.send(result);
    } catch (error) {
        console.error("Error inserting payment:", error);
        res.status(500).send({ message: "Failed to save payment details." });
    }
});


app.post("/make-payment", authenticateUser, async (req, res) => {
    const couponCode = req.body.coupon
    let agreement = await agreementsCollection.findOne({ userEmail: req.user.email, status: "checked" });
    if (!agreement) {
        return res.status(400).send({ message: "Apartment Not Found" })
    }
    agreement.discount = 0
    agreement.saved = 0;
    if (couponCode) {
        let coupon = await couponsCollection.findOne({ code: couponCode });
        if (coupon && coupon?.percentage && !(coupon.expired)) {
            agreement.discount = coupon.percentage;
            agreement.saved = (agreement.rent * coupon.percentage / 100)
        } else {
            agreement.discount = 0;
            agreement.saved = 0
        }
    }
    const totalPrice = (agreement.rent - agreement.saved) * 100
    const { client_secret } = await stripe.paymentIntents.create({
        amount: totalPrice,
        currency: 'usd',
        automatic_payment_methods: {
            enabled: true,
        },
    });

    res.status(200).json({ agreement, clientSecret: client_secret });
})

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));

run().catch(console.dir);

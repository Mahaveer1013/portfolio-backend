const express = require('express');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

dotenv.config(); 

const app = express();

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert({
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
        }),
    });
}

const firestore = admin.firestore();

const globalRateLimiter = rateLimit({
    windowMs: 2 * 60 * 1000, 
    max: 20, 
    message: 'Too many requests from this IP, please try again later',
    headers: true,
});

app.use(cors({
    origin: '*',  // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(globalRateLimiter);


app.use(express.json());

const getIpInfo = async (ip) => {
    try {
        const response = await axios.get(`https://ipinfo.io/${ip}/json?token=b6d3e971852ca4`);
        return response.data;
    } catch (error) {
        return null;
    }
};

app.post('/api/visitor', async (req, res) => {
    const { visitorId, ipAddress } = req.body;

    if (!ipAddress || !visitorId) {
        return res.status(400).json({ message: 'VisitorId and IP Address are required' });
    }

    try {
        const ipInfo = await getIpInfo(ipAddress);

        if (!ipInfo) {
            return res.status(500).json({ message: 'Could not retrieve IP information' });
        }

        const visitorsCollection = firestore.collection('visitors');
        const visitorDoc = visitorsCollection.doc(visitorId);
        const docSnapshot = await visitorDoc.get();

        if (!docSnapshot.exists) {
            await visitorDoc.set({
                visitTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                visitorId: visitorId,
                ...ipInfo,
                count: 1,
            });
            return res.status(201).json({ message: 'Visitor details stored successfully' });
        } else {
            await visitorDoc.update({
                count: admin.firestore.FieldValue.increment(1),
                visitTimestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            return res.status(200).json({ message: 'Visitor count incremented successfully' });
        }
    } catch (error) {
        console.error('Error storing visitor details:', error);
        return res.status(500).json({ message: 'Error storing visitor details' });
    }
});

app.get("/", (req, res) => {
    res.send("backend for https://mahaveer1013.vercel.app")
})

app.get('/api/total-visitors', async (req, res) => {
    try {
        const visitorsCollection = firestore.collection('visitors');
        const querySnapshot = await visitorsCollection.get();

        const distinctVisitors = new Set();
        querySnapshot.forEach(doc => {
            const visitorId = doc.data().visitorId;
            distinctVisitors.add(visitorId);
        });

        return res.status(200).json({ totalVisitors: distinctVisitors.size });
    } catch (error) {
        console.error('Error getting distinct visitors:', error);
        return res.status(500).json({ message: 'Error getting distinct visitors' });
    }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

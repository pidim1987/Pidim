const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่าการเชื่อมต่อ Neon PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ฟังก์ชันสร้างตารางในฐานข้อมูลอัตโนมัติเมื่อเปิดเซิร์ฟเวอร์
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                username VARCHAR(255) UNIQUE NOT NULL,
                avatar TEXT,
                creator_id VARCHAR(50) UNIQUE NOT NULL,
                coins INTEGER DEFAULT 100,
                email VARCHAR(255) DEFAULT '',
                phone VARCHAR(50) DEFAULT '',
                bank_account VARCHAR(100) DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                content TEXT,
                license VARCHAR(100),
                media_url TEXT,
                media_type VARCHAR(50),
                font_family VARCHAR(50) DEFAULT 'sans-serif',
                caption_overlay TEXT DEFAULT '',
                filter VARCHAR(50) DEFAULT '',
                audio_name VARCHAR(255) DEFAULT '',
                audio_remixable BOOLEAN DEFAULT false,
                hash VARCHAR(64),
                likes_count INTEGER DEFAULT 0,
                coins_received INTEGER DEFAULT 0,
                comments_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER REFERENCES users(id),
                receiver_id INTEGER REFERENCES users(id),
                text TEXT,
                media_url TEXT,
                media_type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("🚀 Database tables initialized successfully!");
    } catch (err) {
        console.error("❌ Error initializing database tables:", err);
    }
}

initDB();

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API: สมัครสมาชิก
app.post('/api/register', async (req, res) => {
    const { name, username, avatar } = req.body;
    if (!username || !name) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อและ Username' });
    }

    try {
        const creatorId = 'CR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const userAvatar = avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + username;

        const result = await pool.query(
            `INSERT INTO users (name, username, avatar, creator_id, coins) 
             VALUES ($1, $2, $3, $4, 100) RETURNING *`,
            [name, username.trim().toLowerCase(), userAvatar, creatorId]
        );

        res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ!', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') { // Duplicate unique violation
            return res.status(400).json({ error: 'Username นี้ถูกใช้งานแล้ว' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// API: เข้าสู่ระบบด้วย Username
app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'กรุณากรอก Username' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(username) = $1',
            [username.trim().toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบ Username นี้ในระบบ' });
        }

        res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ!', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: ดึงรายชื่อผู้ใช้ทั้งหมด
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
        res.json({ users: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: อัปเดตข้อมูลโปรไฟล์
app.post('/api/profile/update', async (req, res) => {
    const { userId, name, email, phone, bankAccount, avatar } = req.body;
    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

        const currentUser = userCheck.rows[0];
        const updatedName = name || currentUser.name;
        const updatedEmail = email !== undefined ? email : currentUser.email;
        const updatedPhone = phone !== undefined ? phone : currentUser.phone;
        const updatedBank = bankAccount !== undefined ? bankAccount : currentUser.bank_account;
        const updatedAvatar = avatar || currentUser.avatar;

        const updateResult = await pool.query(
            `UPDATE users SET name = $1, email = $2, phone = $3, bank_account = $4, avatar = $5 
             WHERE id = $6 RETURNING *`,
            [updatedName, updatedEmail, updatedPhone, updatedBank, updatedAvatar, userId]
        );

        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ', user: updateResult.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: เติมเงิน
app.post('/api/topup', upload.single('slip'), async (req, res) => {
    const { userId, coins } = req.body;
    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) return res.status(400).json({ error: 'ไม่พบผู้ใช้งาน' });

        const addCoins = parseInt(coins || 0);
        setTimeout(async () => {
            try {
                await pool.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [addCoins, userId]);
            } catch (e) {
                console.error('Topup background error:', e);
            }
        }, 30000);

        res.json({ success: true, message: 'ระบบได้รับสลิปแล้ว กำลังตรวจสอบภายใน 30 วินาที' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: จัดการแชท
app.get('/api/chat/:user1/:user2', async (req, res) => {
    const u1 = parseInt(req.params.user1);
    const u2 = parseInt(req.params.user2);
    try {
        const result = await pool.query(
            `SELECT sender_id as "senderId", receiver_id as "receiverId", text, media_url as "mediaUrl", media_type as "mediaType", created_at as timestamp 
             FROM chats 
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) 
             ORDER BY created_at ASC`,
            [u1, u2]
        );
        res.json({ chats: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/chat', upload.single('media'), async (req, res) => {
    const { senderId, receiverId, text, mediaType } = req.body;
    let mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;
    let resolvedMediaType = mediaType || (req.file ? (req.file.mimetype.startsWith('video/') ? 'video' : 'image') : null);

    try {
        const result = await pool.query(
            `INSERT INTO chats (sender_id, receiver_id, text, media_url, media_type) 
             VALUES ($1, $2, $3, $4, $5) RETURNING sender_id as "senderId", receiver_id as "receiverId", text, media_url as "mediaUrl", media_type as "mediaType", created_at as timestamp`,
            [parseInt(senderId), parseInt(receiverId), text || '', mediaUrl, resolvedMediaType]
        );

        res.json({ success: true, chat: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: โพสต์
app.get('/api/posts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.user_id, u.name as author_name, u.avatar as author_avatar, u.creator_id,
                   p.content, p.license, p.media_url, p.media_type, p.font_family as "fontFamily",
                   p.caption_overlay as "captionOverlay", p.filter, p.audio_name as "audioName",
                   p.audio_remixable as "audioRemixable", p.hash, p.likes_count, p.coins_received, p.comments_count, p.created_at
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
        `);
        res.json({ posts: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/posts', upload.fields([{ name: 'media', maxCount: 1 }, { name: 'audioFile', maxCount: 1 }]), async (req, res) => {
    const { userId, content, license, fontFamily, captionOverlay, filter, audioName, audioRemixable } = req.body;
    
    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) return res.status(400).json({ error: 'ไม่พบผู้ใช้งาน' });
        const user = userCheck.rows[0];

        let mediaUrl = null;
        let mediaType = null;
        if (req.files && req.files['media']) {
            const file = req.files['media'][0];
            mediaUrl = `/uploads/${file.filename}`;
            mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
        }

        const hash = crypto.createHash('sha256').update((content || '') + Date.now()).digest('hex').substring(0, 16).toUpperCase();
        const isRemixable = audioRemixable === 'true' || audioRemixable === true;

        const result = await pool.query(
            `INSERT INTO posts (user_id, content, license, media_url, media_type, font_family, caption_overlay, filter, audio_name, audio_remixable, hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [user.id, content || '', license || '', mediaUrl, mediaType, fontFamily || 'sans-serif', captionOverlay || '', filter || '', audioName || '', isRemixable, hash]
        );

        const newPost = {
            ...result.rows[0],
            author_name: user.name,
            author_avatar: user.avatar,
            creator_id: user.creator_id
        };

        res.json({ success: true, hash, post: newPost });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/posts/:id/like', async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count',
            [parseInt(req.params.id)]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบโพสต์' });
        res.json({ success: true, likes: result.rows[0].likes_count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/posts/:id/tip', async (req, res) => {
    const { senderId, amount } = req.body;
    const postId = parseInt(req.params.id);
    const tipAmount = parseInt(amount || 0);

    try {
        const senderCheck = await pool.query('SELECT * FROM users WHERE id = $1', [senderId]);
        const postCheck = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);

        if (senderCheck.rows.length === 0 || postCheck.rows.length === 0) {
            return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
        }

        const sender = senderCheck.rows[0];
        const post = postCheck.rows[0];

        if (sender.coins < tipAmount) {
            return res.status(400).json({ error: 'เหรียญของคุณไม่พอ' });
        }

        // หักเหรียญผู้ส่ง และเพิ่มเหรียญให้เจ้าของโพสต์
        await pool.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [tipAmount, sender.id]);
        await pool.query('UPDATE posts SET coins_received = coins_received + $1 WHERE id = $2', [tipAmount, postId]);
        await pool.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [tipAmount, post.user_id]);

        res.json({ success: true, message: `ส่งมอบ ${tipAmount} เหรียญ เรียบร้อยแล้ว!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/posts/:id/comments', async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1 RETURNING comments_count',
            [parseInt(req.params.id)]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบโพสต์' });
        res.json({ success: true, comments_count: result.rows[0].comments_count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

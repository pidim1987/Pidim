const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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

// ---------------- ฐานข้อมูลในหน่วยความจำ ----------------
let users = [
    { id: 4, name: 'SiamCreator', username: 'siam', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=siam', creator_id: 'CR-A1B2', coins: 150, email: '', phone: '', bankAccount: '' },
    { id: 26, name: 'ArtMaster', username: 'art', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=art', creator_id: 'CR-C3D4', coins: 200, email: '', phone: '', bankAccount: '' },
    { id: 27, name: 'DevStudio', username: 'dev', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=dev', creator_id: 'CR-E5F6', coins: 300, email: '', phone: '', bankAccount: '' },
    { id: 28, name: 'MusicWave', username: 'music', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=music', creator_id: 'CR-G7H8', coins: 120, email: '', phone: '', bankAccount: '' }
];
let posts = [];
let chats = []; // เก็บข้อความแชท [{senderId, receiverId, text, mediaUrl, mediaType, timestamp}]

// API: สมัครสมาชิก
app.post('/api/register', (req, res) => {
    const { name, username, avatar } = req.body;
    const userId = users.length + 1;
    const creatorId = 'CR-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const newUser = {
        id: userId,
        name,
        username,
        avatar: avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + username,
        creator_id: creatorId,
        coins: 100,
        email: '',
        phone: '',
        bankAccount: ''
    };

    users.push(newUser);
    res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ!', user: newUser });
});

// API: เข้าสู่ระบบด้วย Username (เพิ่มเข้ามาใหม่)
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'กรุณากรอก Username' });
    }

    const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user) {
        return res.status(404).json({ error: 'ไม่พบ Username นี้ในระบบ' });
    }

    res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ!', user });
});

// API: ดึงรายชื่อผู้ใช้ทั้งหมด (สำหรับเช็คชื่อเพื่อนในแชท)
app.get('/api/users', (req, res) => {
    res.json({ users });
});

// API: อัปเดตข้อมูลโปรไฟล์
app.post('/api/profile/update', (req, res) => {
    const { userId, name, email, phone, bankAccount, avatar } = req.body;
    const user = users.find(u => u.id === parseInt(userId));
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.bankAccount = bankAccount || user.bankAccount;
    if (avatar) user.avatar = avatar;

    res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ', user });
});

// API: เติมเงิน
app.post('/api/topup', upload.single('slip'), (req, res) => {
    const { userId, coins } = req.body;
    const user = users.find(u => u.id === parseInt(userId));
    if (!user) return res.status(400).json({ error: 'ไม่พบผู้ใช้งาน' });

    setTimeout(() => {
        user.coins += parseInt(coins || 0);
    }, 30000);

    res.json({ success: true, message: 'ระบบได้รับสลิปแล้ว กำลังตรวจสอบภายใน 30 วินาที' });
});

// API: จัดการแชท (รับส่งข้อความ/รูป/วิดีโอ/เสียง)
app.get('/api/chat/:user1/:user2', (req, res) => {
    const u1 = parseInt(req.params.user1);
    const u2 = parseInt(req.params.user2);
    const conversation = chats.filter(c => 
        (c.senderId === u1 && c.receiverId === u2) || (c.senderId === u2 && c.receiverId === u1)
    );
    res.json({ chats: conversation });
});

app.post('/api/chat', upload.single('media'), (req, res) => {
    const { senderId, receiverId, text, mediaType } = req.body;
    let mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newChat = {
        senderId: parseInt(senderId),
        receiverId: parseInt(receiverId),
        text: text || '',
        mediaUrl,
        mediaType: mediaType || (req.file ? (req.file.mimetype.startsWith('video/') ? 'video' : 'image') : null),
        timestamp: Date.now()
    };

    chats.push(newChat);
    res.json({ success: true, chat: newChat });
});

// API: โพสต์
app.get('/api/posts', (req, res) => {
    res.json({ posts: posts.slice().reverse() });
});

app.post('/api/posts', upload.single('media'), (req, res) => {
    const { userId, content, license } = req.body;
    const user = users.find(u => u.id === parseInt(userId));
    if (!user) return res.status(400).json({ error: 'ไม่พบผู้ใช้งาน' });

    let mediaUrl = null;
    let mediaType = null;
    if (req.file) {
        mediaUrl = `/uploads/${req.file.filename}`;
        mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    }

    const hash = crypto.createHash('sha256').update(content + Date.now()).digest('hex').substring(0, 16).toUpperCase();
    const newPost = {
        id: posts.length + 1,
        user_id: user.id,
        author_name: user.name,
        author_avatar: user.avatar,
        creator_id: user.creator_id,
        content,
        license,
        media_url: mediaUrl,
        media_type: mediaType,
        hash,
        likes_count: 0,
        coins_received: 0,
        comments_count: 0
    };

    posts.push(newPost);
    res.json({ success: true, hash, post: newPost });
});

app.post('/api/posts/:id/like', (req, res) => {
    const post = posts.find(p => p.id === parseInt(req.params.id));
    if (post) {
        post.likes_count += 1;
        return res.json({ success: true, likes: post.likes_count });
    }
    res.status(404).json({ error: 'ไม่พบโพสต์' });
});

app.post('/api/posts/:id/tip', (req, res) => {
    const { senderId, amount } = req.body;
    const post = posts.find(p => p.id === parseInt(req.params.id));
    const sender = users.find(u => u.id === parseInt(senderId));

    if (!post || !sender) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    if (sender.coins < amount) return res.status(400).json({ error: 'เหรียญของคุณไม่พอ' });

    sender.coins -= amount;
    post.coins_received += amount;
    const owner = users.find(u => u.id === post.user_id);
    if (owner) owner.coins += amount;

    res.json({ success: true, message: `ส่งมอบ ${amount} เหรียญ เรียบร้อยแล้ว!` });
});

app.post('/api/posts/:id/comments', (req, res) => {
    const post = posts.find(p => p.id === parseInt(req.params.id));
    if (post) {
        post.comments_count += 1;
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'ไม่พบโพสต์' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

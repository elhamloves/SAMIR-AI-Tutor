import React from 'react';

const AboutMode = () => (
    <div className="space-y-4 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
        <h2 className="text-2xl font-bold heading-glow">About Us</h2>
        <p className="text-[#94a3b8]">Samir helps students learn with guided chats, quizzes, and progress tracking.</p>
        <h3 className="text-xl font-semibold heading-glow">Contact Us</h3>
        <p className="text-[#94a3b8]">Email: support@samir.ai (placeholder)</p>
        <h3 className="text-xl font-semibold heading-glow">Copyright</h3>
        <p className="text-[#94a3b8]">© {new Date().getFullYear()} Samir. All rights reserved.</p>
    </div>
);

export default AboutMode;


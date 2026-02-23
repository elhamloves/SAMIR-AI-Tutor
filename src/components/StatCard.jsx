import React from 'react';

const StatCard = ({ title, value, color }) => (
    <div className={`p-4 rounded-xl text-white ${color} shadow-lg`}>
        <p className="text-sm opacity-80">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
);

export default StatCard;


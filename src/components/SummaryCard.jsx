import React from 'react';

const SummaryCard = ({ title, data, color }) => (
    <div className={`p-4 border-t-4 ${color} bg-white rounded-lg shadow-lg`}>
        <h4 className="text-lg font-bold text-gray-700 mb-3">{title}</h4>
        <ul className="space-y-1 text-sm text-gray-600">
            {data.length > 0 ? (
                data.map((item, index) => <li key={index} className="flex items-start"><span className={`mr-2 ${color.replace('border-', 'text-')}`}>•</span>{item}</li>)
            ) : (
                <li>No data yet.</li>
            )}
        </ul>
    </div>
);

export default SummaryCard;


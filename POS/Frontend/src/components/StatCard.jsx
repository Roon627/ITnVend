import React from 'react';
import { Link } from 'react-router-dom';

const StatCard = ({ icon, title, value, link, bgColor = 'bg-blue-100', textColor = 'text-blue-800' }) => {
  const content = (
    <div className={`p-4 rounded-lg shadow-md transition-transform transform hover:scale-105 ${bgColor}`}>
      <div className="flex items-center">
        <div className={`p-3 rounded-full ${textColor} ${bgColor.replace('100', '200')}`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className={`text-sm font-medium text-gray-500`}>{title}</p>
          <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
        </div>
      </div>
    </div>
  );

  return link ? <Link to={link}>{content}</Link> : <div>{content}</div>;
};

export default StatCard;

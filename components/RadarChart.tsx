import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { StyleMetrics } from '../types';

interface StyleRadarProps {
  metrics: StyleMetrics;
  color?: string;
}

const StyleRadar: React.FC<StyleRadarProps> = ({ metrics, color = "#06b6d4" }) => {
  const data = [
    { subject: 'Humor', A: metrics.humor, fullMark: 100 },
    { subject: 'Logic', A: metrics.logic, fullMark: 100 },
    { subject: 'Emotion', A: metrics.emotion, fullMark: 100 },
    { subject: 'Complex', A: metrics.complexity, fullMark: 100 },
    { subject: 'Pacing', A: metrics.pacing, fullMark: 100 },
    { subject: 'Informal', A: metrics.informality, fullMark: 100 },
  ];

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Style"
            dataKey="A"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StyleRadar;
interface AvatarProps {
  username: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
};

export default function Avatar({ username, color, size = 'md', className = '' }: AvatarProps) {
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${sizes[size]} ${className}`}
      style={{ backgroundColor: color }}
      title={username}
    >
      {username[0]?.toUpperCase() || '?'}
    </div>
  );
}

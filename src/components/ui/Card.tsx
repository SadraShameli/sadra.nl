interface CardProps {
  children: React.ReactNode | React.ReactNode[];
}

export default function Card({ children }: CardProps) {
  return (
    <div className="rounded-2xl border bg-black p-5 xl:p-10">{children}</div>
  );
}

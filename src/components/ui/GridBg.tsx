export default function GridBackground() {
    return (
        <div className="fixed -top-0 -z-50">
            <div className="absolute -right-24 bottom-[30%] h-[1000px] w-[1000px] rounded-full bg-[radial-gradient(circle_400px_at_50%_400px,#fbfbfb36,#000)] opacity-75" />
            <div className="absolute top-[60%] -left-24 h-[1000px] w-[1000px] rounded-full bg-[radial-gradient(circle_400px_at_50%_400px,#fbfbfb36,#000)] opacity-75" />
            <div className="bg-grid h-screen w-screen" />
        </div>
    );
}

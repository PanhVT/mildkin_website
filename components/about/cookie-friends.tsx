import { FriendArt } from "./friend-art";
import "./cookie-friends.css";

const friends = [
  {
    kind: "bear",
    name: "Bear",
    title: "Bạn gấu ấm áp",
    text: "Chậm rãi, ấm áp và luôn sẵn sàng ngồi cạnh bạn trong một buổi chiều thật yên.",
  },
  {
    kind: "rabbit",
    name: "Rabbit",
    title: "Bạn thỏ dịu dàng",
    text: "Nhẹ nhàng, đáng yêu và mang theo một chút năng lượng vui vẻ.",
  },
  {
    kind: "cat",
    name: "Cat",
    title: "Bạn mèo thư thả",
    text: "Có chút tinh nghịch, có chút lười biếng và rất hợp với những ngày chỉ muốn nghỉ ngơi.",
  },
] as const;

export function CookieFriends() {
  return (
    <section
      className="container meet-friends"
      aria-labelledby="meet-friends-title"
    >
      <div className="meet-friends-heading">
        <span className="eyebrow">MEET THE FRIENDS</span>
        <h2 id="meet-friends-title">Gặp những người bạn nhỏ</h2>
        <p>Mỗi chiếc bánh có một chút cá tính riêng.</p>
      </div>
      <div className="meet-friends-grid">
        {friends.map((friend) => (
          <article
            key={friend.kind}
            className={`meet-friend meet-friend-${friend.kind}`}
          >
            <div className="meet-friend-art">
              <FriendArt kind={friend.kind} />
            </div>
            <h3>{friend.name}</h3>
            <p className="meet-friend-tagline">{friend.title}</p>
            <p>{friend.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

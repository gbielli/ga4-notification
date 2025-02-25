import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

interface PersonCardProps {
  name: string;
  months: string;
  imageUrl: string;
}

function PersonCard({ name, months, imageUrl }: PersonCardProps) {
  return (
    <Card className="">
      <CardContent className="pt-6 flex flex-col items-center">
        <Avatar className="w-20 h-20 bg-gradient-to-r from-blue-300 to-blue-800">
          <AvatarImage
            src={imageUrl}
            className="p-0.5 rounded-full"
            alt={name}
          />
        </Avatar>
        <h3 className="mt-4 font-medium">{name}</h3>
        <p className="text-sm text-muted-foreground">{months} mois</p>
      </CardContent>
    </Card>
  );
}

export default function PeopleGrid() {
  const people = [
    {
      name: "Jacob Jones",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/men/1.jpg",
    },
    {
      name: "Marvin McKinney",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/men/2.jpg",
    },
    {
      name: "Leslie Alexander",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/women/1.jpg",
    },
    {
      name: "Darrell Steward",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/men/3.jpg",
    },
    {
      name: "Courtney Henry",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/women/2.jpg",
    },
    {
      name: "Bessie Cooper",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/women/3.jpg",
    },
    {
      name: "Arlene McCoy",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/women/4.jpg",
    },
    {
      name: "Kathryn Murphy",
      months: "3",
      imageUrl: "https://randomuser.me/api/portraits/women/5.jpg",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {people.map((person) => (
        <PersonCard
          key={person.name}
          name={person.name}
          months={person.months}
          imageUrl={person.imageUrl}
        />
      ))}
    </div>
  );
}

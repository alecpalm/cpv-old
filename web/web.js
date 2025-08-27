import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

const websites = [
  {
    name: "Ben for Lou",
    url: "https://www.benforlou.com/",
    image: "/images/benforlou.png",
    description: "A grassroots campaign advocating for local progress.",
    tag: "Modern",
    tagColor: "bg-blue-500"
  },
  {
    name: "Kara for Oakland",
    url: "https://www.kmb4oakland.com/",
    image: "/images/kmb4oakland.png",
    description: "Championing change and equity in Oakland.",
    tag: "Bold",
    tagColor: "bg-red-500"
  },
  {
    name: "Debbie Wesslund",
    url: "https://web.archive.org/web/20240322002743/https://www.debbiewesslund.com/",
    image: "/images/debbiewesslund.png",
    description: "A dedicated leader focused on education and community.",
    tag: "Classic",
    tagColor: "bg-green-500"
  },
  {
    name: "Matt for Metro",
    url: "https://web.archive.org/web/20240917052804/https://www.mattformetro.com/",
    image: "/images/mattformetro.png",
    description: "Innovative solutions for urban transit and infrastructure.",
    tag: "Innovative",
    tagColor: "bg-yellow-500"
  },
  {
    name: "Rick for Council",
    url: "https://web.archive.org/web/20240616091840/https://www.rickforcouncil.com/",
    image: "/images/rickforcouncil.png",
    description: "Empowering communities through strategic policy.",
    tag: "Progressive",
    tagColor: "bg-purple-500"
  }
];

const Showcase = () => {
  return (
    <div className="min-h-screen bg-white p-6 md:p-10 flex flex-col items-center">
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-8 md:mb-12 text-gray-900 tracking-tight leading-tight bg-clip-text text-transparent bg-gradient-to-r from-red-600 via-purple-500 to-blue-600">
        Civic Voice Partners: Website Portfolio
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl w-full px-4 md:px-0">
        {websites.map((site, index) => (
          <motion.a
            key={index}
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="block focus:ring focus:ring-red-300 rounded-lg"
          >
            <Card className="overflow-hidden shadow-md rounded-2xl border border-gray-200 transition-all duration-300 bg-gradient-to-br from-white via-gray-50 to-gray-100 hover:shadow-xl flex flex-col h-full relative">
              <div className={`absolute top-3 right-3 ${site.tagColor} text-white text-xs md:text-sm font-medium px-3 py-1 rounded-full shadow-md`}>
                {site.tag}
              </div>
              <img src={site.image} alt={site.name} className="w-full h-40 md:h-52 object-cover" />
              <CardContent className="p-4 md:p-6 flex flex-col flex-grow">
                <h2 className="text-base md:text-lg font-semibold text-gray-900">{site.name}</h2>
                <p className="text-xs md:text-sm text-gray-600 mt-1 leading-snug flex-grow">{site.description}</p>
              </CardContent>
            </Card>
          </motion.a>
        ))}
      </div>
    </div>
  );
};

export default Showcase;

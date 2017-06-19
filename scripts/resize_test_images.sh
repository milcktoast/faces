rm -rf ./static
mkdir ./static
cp -Rf ./assets ./static
cd ./static/assets/test

mogrify -resize 600x400^ -gravity center -extent 600x400 *.jpg

counter=0
for f in *.jpg
do
  echo "$counter.jpg << $f"
  mv "$f" "$counter.jpg"
  counter=$((counter+1))
done

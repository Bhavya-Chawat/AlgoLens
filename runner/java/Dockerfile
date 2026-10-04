# AlgoLens Java runner: compiles a solution and traces its real execution with the JDK's debugger.
# Started per run by the app:  docker run --rm -i --network none --read-only --cap-drop ALL ...
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /src
COPY src ./src
COPY lib ./lib
RUN mkdir classes \
 && javac --release 21 -encoding UTF-8 -cp lib/gson.jar -d classes src/*.java \
 && cp src/LeetCodeHelpers.java.txt classes/ \
 && jar cf algolens-java.jar -C classes .

FROM eclipse-temurin:21-jdk-alpine
RUN adduser -D -u 10001 runner && mkdir -p /opt/algolens /work && chown 10001 /work
COPY --from=build /src/algolens-java.jar /opt/algolens/algolens-java.jar
COPY lib/gson.jar /opt/algolens/gson.jar
USER 10001
WORKDIR /work
ENTRYPOINT ["java", "-XX:+UseSerialGC", "-XX:-UsePerfData", "-Xshare:auto", "-XX:TieredStopAtLevel=1", "-Xmx256m", \
            "-Dalgolens.work=/work", "-Dalgolens.lib=/opt/algolens", \
            "-cp", "/opt/algolens/algolens-java.jar:/opt/algolens/gson.jar", "AlgoRunner"]

# AlgoLens C++ runner: compiles a solution with a modern GCC and traces its REAL execution with gdb.
# Started per run by the app:  docker run --rm -i --network none --read-only --cap-drop ALL ...
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ gdb python3 nlohmann-json3-dev \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m -d /home/runner runner \
 && mkdir -p /opt/algolens /work && chown 10001 /work
COPY prelude.h /opt/algolens/
# Precompiled header: <bits/stdc++.h> alone is ~1.5s of parsing per run. Flags must match run.py's compile.
# (Built before the other files are copied, so editing trace.py / run.py does not redo this layer.)
RUN g++ -std=c++20 -g -O0 -fno-omit-frame-pointer -x c++-header /opt/algolens/prelude.h -o /opt/algolens/prelude.h.gch
# The JSON half of the driver (nlohmann/json) is compiled once, here, not on every run.
COPY algolens_nodes.h algolens_driver.h algolens_rt.cpp /opt/algolens/
RUN cd /opt/algolens && g++ -std=c++20 -g -O0 -fno-omit-frame-pointer -I/opt/algolens -c algolens_rt.cpp -o algolens_rt.o
COPY trace.py run.py /opt/algolens/
RUN chmod -R a+rX /opt/algolens
USER 10001
WORKDIR /work
ENTRYPOINT ["python3", "/opt/algolens/run.py"]
